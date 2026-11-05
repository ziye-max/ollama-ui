use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, WindowEvent,
};

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window
            .unminimize()
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus())
        {
            eprintln!("restore main window: {error}");
        }
    }
}

fn menu(app: &AppHandle, language: &str) -> tauri::Result<Menu<tauri::Wry>> {
    let english = language == "en-US";
    let open = MenuItem::with_id(
        app,
        "open",
        if english {
            "Open window"
        } else {
            "打开窗口"
        },
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        if english { "Quit" } else { "退出" },
        true,
        None::<&str>,
    )?;
    Menu::with_items(app, &[&open, &separator, &quit])
}

pub fn update_language(app: &AppHandle, language: &str) -> tauri::Result<()> {
    let title = "ollama ui";
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu(app, language)?))?;
        tray.set_tooltip(Some(title))?;
    }
    if let Some(window) = app.get_webview_window("main") {
        window.set_title(title)?;
    }
    Ok(())
}

pub fn setup(app: &App) -> tauri::Result<()> {
    let language = app
        .state::<std::sync::Arc<crate::AppState>>()
        .settings
        .blocking_read()
        .language
        .clone();
    let menu = menu(app.handle(), &language)?;
    let icon = app
        .default_window_icon()
        .ok_or_else(|| std::io::Error::other("缺少应用托盘图标"))?
        .clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("ollama ui")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => {
                show_main_window(app);
                if let Err(error) = app.emit_to("main", "app-exit-requested", ()) {
                    eprintln!("request application exit: {error}");
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    update_language(app.handle(), &language)?;

    if let Some(window) = app.get_webview_window("main") {
        let main_window = window.clone();
        window.on_window_event(move |event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if let Err(error) = main_window.hide() {
                    eprintln!("hide main window: {error}");
                }
            }
            WindowEvent::Resized(_) if main_window.is_minimized().unwrap_or(false) => {
                if let Err(error) = main_window.hide() {
                    eprintln!("minimize to tray: {error}");
                }
            }
            _ => {}
        });
    }
    Ok(())
}
