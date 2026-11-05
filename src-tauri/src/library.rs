use crate::{
    error::{AppError, Result},
    ollama,
};
use scraper::{ElementRef, Html, Selector};
use serde::Serialize;
use std::{collections::HashSet, time::Duration};
use url::Url;

const BASE_URL: &str = "https://ollama.com/";
const MAX_PAGE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearch {
    pub models: Vec<LibraryModelSummary>,
    pub page: u32,
    pub has_more: bool,
    pub total: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryModelSummary {
    pub name: String,
    pub description: String,
    pub downloads: Option<String>,
    pub tag_count: Option<u32>,
    pub categories: Vec<String>,
    pub parameter_sizes: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryModel {
    pub name: String,
    pub description: String,
    pub downloads: Option<String>,
    pub updated_at: Option<String>,
    pub categories: Vec<String>,
    pub readme: String,
    pub tags: Vec<LibraryTag>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTag {
    pub name: String,
    pub size: Option<String>,
    pub context_length: Option<String>,
    pub capabilities: Option<String>,
    pub digest: Option<String>,
    pub is_default: bool,
}

fn library_error(message: &str) -> AppError {
    AppError::new("library_unavailable", message)
}

fn network_error(error: reqwest::Error) -> AppError {
    library_error("无法连接 Ollama 官方模型库，请检查网络后重试。").detail(error)
}

fn selector(value: &str) -> Result<Selector> {
    Selector::parse(value)
        .map_err(|error| library_error("官方模型库页面格式暂不兼容，请稍后重试。").detail(error))
}

fn text(element: ElementRef<'_>) -> String {
    element
        .text()
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn categories(root: ElementRef<'_>) -> Vec<String> {
    let Some(query) = selector(".bg-indigo-50").ok() else {
        return Vec::new();
    };
    let mut found = HashSet::new();
    root.select(&query)
        .map(text)
        .filter(|value| !value.is_empty() && found.insert(value.to_lowercase()))
        .collect()
}

fn model_slug(name: &str) -> Result<String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 180 || name.contains(':') {
        return Err(library_error("模型名称无效，无法读取官方详情。"));
    }
    let validated = ollama::canonical_name(&format!("{name}:latest"))?;
    Ok(validated.trim_end_matches(":latest").to_owned())
}

fn page_url(path: &str) -> Result<Url> {
    Url::parse(BASE_URL)
        .unwrap()
        .join(path)
        .map_err(|error| library_error("官方模型库地址无效。").detail(error))
}

async fn fetch_page(client: &reqwest::Client, url: Url) -> Result<String> {
    let mut request = client.get(url.clone());
    if url.path() == "/search" {
        request = request.header("HX-Request", "true");
    }
    let response = request.send().await.map_err(network_error)?;
    if response.url().host_str() != Some("ollama.com") {
        return Err(library_error("官方模型库重定向到了不支持的地址。"));
    }
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(library_error("未找到该官方模型或标签。"));
    }
    if !response.status().is_success() {
        let status = response.status();
        let mut error = library_error("Ollama 官方模型库暂时无法提供内容，请稍后重试。")
            .detail(format!("HTTP {status}"));
        error.retryable = status.is_server_error() || status.as_u16() == 429;
        return Err(error);
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PAGE_BYTES as u64)
    {
        return Err(library_error("官方模型库页面超出大小限制。"));
    }
    let mut response = response;
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if body.len().saturating_add(chunk.len()) > MAX_PAGE_BYTES {
            return Err(library_error("官方模型库页面超出大小限制。"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&body).into_owned())
}

async fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 3 {
                attempt.error("too many official library redirects")
            } else if attempt.url().scheme() == "https"
                && attempt.url().host_str() == Some("ollama.com")
            {
                attempt.follow()
            } else {
                attempt.error("unsupported official library redirect")
            }
        }))
        .user_agent(concat!("local-ollama-client/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(network_error)
}

pub async fn search(query: &str, page: u32) -> Result<LibrarySearch> {
    let query = query.trim();
    if query.chars().count() > 100 {
        return Err(library_error("搜索词不能超过 100 个字符。"));
    }
    let page = page.clamp(1, 10_000);
    let mut url = page_url("search")?;
    {
        let mut params = url.query_pairs_mut();
        params.append_pair("q", query);
        params.append_pair("c", "local");
        if page > 1 {
            params.append_pair("page", &page.to_string());
        }
    }
    let client = client().await?;
    let html = fetch_page(&client, url).await?;
    parse_search(&html, page)
}

pub async fn model_details(name: &str) -> Result<LibraryModel> {
    let name = model_slug(name)?;
    let mut model_url = page_url("library")?;
    model_url
        .path_segments_mut()
        .map_err(|_| library_error("无法生成官方模型地址。"))?
        .extend(name.split('/'));
    let mut tags_url = model_url.clone();
    tags_url
        .path_segments_mut()
        .map_err(|_| library_error("无法生成模型标签地址。"))?
        .push("tags");

    let client = client().await?;
    let (model_html, tags_html) = tokio::try_join!(
        fetch_page(&client, model_url),
        fetch_page(&client, tags_url)
    )?;
    let document = Html::parse_document(&model_html);
    let name_selector = selector("h1 a[title], h1 + a[title], a[title]")?;
    let page_name = document
        .select(&name_selector)
        .filter_map(|element| element.value().attr("title"))
        .next()
        .unwrap_or(&name)
        .to_owned();
    let summary = selector("#summary-content")?;
    let metrics = selector("p.flex.space-x-5")?;
    let updated = selector("span[title]")?;
    let metrics_element = document.select(&metrics).next();
    let downloads = metrics_element.and_then(|element| {
        element
            .select(&selector("span.flex.items-center").ok()?)
            .next()
            .map(text)
    });
    let updated_at = document
        .select(&updated)
        .filter_map(|element| element.value().attr("title"))
        .find(|value| value.contains("UTC"))
        .map(str::to_owned);
    let tags = parse_tags(&tags_html, &name)?;

    Ok(LibraryModel {
        name: page_name,
        description: document
            .select(&summary)
            .next()
            .map(text)
            .unwrap_or_default(),
        downloads,
        updated_at,
        categories: categories(document.root_element()),
        readme: document.select(&selector("#readme #display p, #readme #display h1, #readme #display h2, #readme #display h3, #readme #display li, #readme #display pre")?)
            .map(text).filter(|value| !value.is_empty()).collect::<Vec<_>>().join("\n\n"),
        tags,
    })
}

fn parse_search(html: &str, page: u32) -> Result<LibrarySearch> {
    let document = Html::parse_document(html);
    let cards = selector("li")?;
    let title = selector("h2[title]")?;
    let description = selector("p.line-clamp-2")?;
    let download_count_selector = selector("span[title*='downloads']")?;
    let parameter_sizes = selector("span[class*='bg-[#ddf4ff]']")?;
    let results = selector("[data-result-count]")?;
    let next_page = selector("li[hx-get*='page=']")?;
    let mut models = Vec::new();

    for card in document.select(&cards) {
        let Some(heading) = card.select(&title).next() else {
            continue;
        };
        let Some(name) = heading
            .value()
            .attr("title")
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let Ok(name) = model_slug(name) else { continue };
        let downloads = card
            .select(&download_count_selector)
            .next()
            .and_then(|element| element.value().attr("title"))
            .map(|value| value.trim_end_matches(" downloads").to_owned());
        let tag_count = card.select(&selector("span")?).map(text).find_map(|value| {
            value
                .strip_suffix(" tags")
                .and_then(|count| count.replace(',', "").parse().ok())
        });
        models.push(LibraryModelSummary {
            name,
            description: card
                .select(&description)
                .next()
                .map(text)
                .unwrap_or_default(),
            downloads,
            tag_count,
            categories: categories(card),
            parameter_sizes: card
                .select(&parameter_sizes)
                .map(text)
                .filter(|value| !value.is_empty())
                .collect(),
        });
    }

    let result_count = document.select(&results).next();
    let total = result_count
        .and_then(|element| element.value().attr("data-result-count"))
        .and_then(|value| value.parse().ok());
    let has_more = result_count.and_then(|element| element.value().attr("data-has-more"))
        == Some("true")
        || document.select(&next_page).next().is_some();
    if (page == 1 && total.is_none()) || (models.is_empty() && total.unwrap_or_default() > 0) {
        return Err(library_error("官方模型库结果格式暂不兼容。"));
    }
    Ok(LibrarySearch {
        models,
        page,
        has_more,
        total,
    })
}

fn parse_tags(html: &str, model: &str) -> Result<Vec<LibraryTag>> {
    let document = Html::parse_document(html);
    let rows = selector(".group.px-4.py-3")?;
    let anchors = selector("a[href^='/library/']")?;
    let data = selector(".col-span-2")?;
    let digests = selector("span.font-mono")?;
    let latest = selector(".border-blue-500")?;
    let mut seen = HashSet::new();
    let mut tags = Vec::new();

    for row in document.select(&rows) {
        let Some(href) = row
            .select(&anchors)
            .filter_map(|element| element.value().attr("href"))
            .next()
        else {
            continue;
        };
        let Some(name) = href.strip_prefix("/library/") else {
            continue;
        };
        if !name.starts_with(&format!("{model}:"))
            || !seen.insert(name.to_owned())
            || ollama::download_name(name).is_err()
        {
            continue;
        }
        let columns: Vec<_> = row
            .select(&data)
            .map(text)
            .filter(|value| !value.is_empty())
            .collect();
        let digest = row.select(&digests).map(text).find(|value| {
            value.len() >= 10 && value.chars().all(|character| character.is_ascii_hexdigit())
        });
        tags.push(LibraryTag {
            name: name.to_owned(),
            size: columns.first().cloned(),
            context_length: columns.get(1).cloned(),
            capabilities: columns.get(2).cloned(),
            digest,
            is_default: name.ends_with(":latest")
                || row
                    .select(&latest)
                    .any(|element| text(element).eq_ignore_ascii_case("latest")),
        });
    }

    if tags.is_empty() {
        return Err(library_error("该模型暂时没有可直接下载的本机标签。"));
    }
    Ok(tags)
}

#[cfg(test)]
mod tests {
    use super::{model_slug, parse_search, parse_tags};

    #[test]
    #[ignore = "requires locally captured official HTML"]
    fn parses_captured_official_pages() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".cache/library-source");
        let search = parse_search(
            &std::fs::read_to_string(root.join("search.html")).unwrap(),
            1,
        )
        .unwrap();
        assert_eq!(search.models[0].name, "smollm2");
        assert_eq!(search.models[0].tag_count, Some(49));
        assert_eq!(search.models[0].parameter_sizes, ["135m", "360m", "1.7b"]);
        assert!(search.has_more);
        let tags = parse_tags(
            &std::fs::read_to_string(root.join("tags.html")).unwrap(),
            "smollm2",
        )
        .unwrap();
        assert!(tags
            .iter()
            .any(|tag| tag.name == "smollm2:135m" && tag.size.as_deref() == Some("271MB")));
        println!(
            "Captured official search: {} models, {} tags",
            search.models.len(),
            tags.len()
        );
    }

    #[tokio::test]
    #[ignore = "requires public internet access to ollama.com"]
    async fn official_library_live_requests() {
        let first = super::search("", 1).await.unwrap();
        assert!(!first.models.is_empty());
        assert!(first.has_more);
        let second = super::search("", 2).await.unwrap();
        assert!(!second.models.is_empty());
        assert_ne!(first.models[0].name, second.models[0].name);
        let found = super::search("smollm2", 1).await.unwrap();
        assert!(found.models.iter().any(|model| model.name == "smollm2"));
        let detail = super::model_details("smollm2").await.unwrap();
        assert_eq!(detail.name, "smollm2");
        assert!(!detail.description.is_empty());
        assert!(detail.tags.iter().any(|tag| tag.name == "smollm2:135m"));
        println!(
            "Official first page: {} models; page 2 first: {}; detail: {} tags",
            first.models.len(),
            second.models[0].name,
            detail.tags.len()
        );
    }

    #[test]
    fn parses_official_search_cards_and_pagination() {
        let html = r#"
            <div id="searchresults" data-result-count="31" data-has-more="true">
              <ul><li><a href="/library/smollm2"><h2 title="smollm2">SmolLM2</h2>
                <p class="line-clamp-2">Compact &amp; open-source</p>
                <span title="4,168,326 downloads">4.2M</span><span title="49 tags">49 tags</span>
                <span class="bg-[#ddf4ff]">135m</span><span class="bg-[#ddf4ff]">1.7b</span>
                <span class="bg-indigo-50">tools</span></a></li>
              <li hx-get="/search?page=2&amp;q=smollm2"></li></ul>
            </div>"#;
        let result = parse_search(html, 1).unwrap();
        assert_eq!(result.total, Some(31));
        assert!(result.has_more);
        assert_eq!(result.models.len(), 1);
        assert_eq!(result.models[0].name, "smollm2");
        assert_eq!(result.models[0].description, "Compact & open-source");
        assert_eq!(result.models[0].downloads.as_deref(), Some("4,168,326"));
        assert_eq!(result.models[0].tag_count, Some(49));
        assert_eq!(result.models[0].categories, ["tools"]);
        assert_eq!(result.models[0].parameter_sizes, ["135m", "1.7b"]);
    }

    #[test]
    fn reads_official_tags_and_omits_cloud_only_tags() {
        let html = r#"
            <section><div class="group px-4 py-3">
              <a href="/library/smollm2:latest"><span>latest</span></a>
              <div><a href="/library/smollm2:latest"><span>latest</span></a>
                <p class="col-span-2">1.8GB</p><p class="col-span-2">8K</p>
                <div class="col-span-2">Text</div><span class="font-mono">cef4a1e09247</span>
              </div></div>
            <div class="group px-4 py-3"><a href="/library/smollm2:latest"><span>latest</span></a></div>
            <div class="group px-4 py-3"><a href="/library/smollm2:cloud"><span>cloud</span></a></div>
            </section>"#;
        let tags = parse_tags(html, "smollm2").unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "smollm2:latest");
        assert_eq!(tags[0].size.as_deref(), Some("1.8GB"));
        assert_eq!(tags[0].context_length.as_deref(), Some("8K"));
        assert_eq!(tags[0].capabilities.as_deref(), Some("Text"));
        assert_eq!(tags[0].digest.as_deref(), Some("cef4a1e09247"));
        assert!(tags[0].is_default);
    }

    #[test]
    fn validates_official_names_before_building_a_route() {
        assert_eq!(model_slug("org/small-model").unwrap(), "org/small-model");
        for invalid in ["", "../outside", "https://attacker", "model:tag", "x\\\\y"] {
            assert!(model_slug(invalid).is_err(), "{invalid}");
        }
    }
}
