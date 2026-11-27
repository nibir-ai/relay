use rune::color::hex;
use rune::tok::type_;
use rune::{Color, Cx, El, ScrollSpec, TextEdit, TextStyle, col, el, row, text, text_input};
use rune_kit::{Kit, Select, SelectAppearance};

use crate::{AUTH, EDITORS, State, THEMES, transport::METHODS};

struct Palette {
    canvas: Color,
    surface: Color,
    input: Color,
    border: Color,
    text: Color,
    muted: Color,
    accent: Color,
    on_accent: Color,
    danger: Color,
}

fn palette(name: &str) -> Palette {
    let colors = match name {
        "One Dark" => [
            "#20232a", "#282c34", "#1c1f25", "#393e48", "#e4e8ef", "#adb7c8", "#61afef", "#17212b",
            "#ef939b",
        ],
        "Gruvbox" => [
            "#272522", "#33302b", "#211f1d", "#51483b", "#f2e1bc", "#c7ad87", "#e4b768", "#282019",
            "#f29b89",
        ],
        "Nord" => [
            "#242936", "#2e3440", "#212632", "#414b5d", "#eef2f8", "#b9c5d8", "#8fbcda", "#17232b",
            "#f0a0a8",
        ],
        "Paper" => [
            "#f3f3ef", "#ffffff", "#f8f8f5", "#d0d5d2", "#19292e", "#475b61", "#176c72", "#ffffff",
            "#9b3039",
        ],
        _ => [
            "#10191d", "#152126", "#0d1619", "#2b3e43", "#edf4f5", "#a1b4b7", "#86d4b2", "#10231e",
            "#f3979c",
        ],
    };
    let [
        canvas,
        surface,
        input,
        border,
        text,
        muted,
        accent,
        on_accent,
        danger,
    ] = colors.map(|color| hex(color).expect("theme color"));
    Palette {
        canvas,
        surface,
        input,
        border,
        text,
        muted,
        accent,
        on_accent,
        danger,
    }
}

fn button(key: impl Into<String>, label: &str, active: bool, primary: bool, p: &Palette) -> El {
    let bg = if primary {
        p.accent
    } else if active {
        p.border
    } else {
        p.surface
    };
    let ink = if primary { p.on_accent } else { p.text };
    el().key(key)
        .role("button")
        .label(label)
        .focusable(true)
        .h(34.0)
        .px(11.0)
        .center()
        .radius(6.0)
        .fill(bg)
        .focus_ring(2.0, 1.0, p.accent)
        .child(text(label).font(type_::LABEL).color(ink))
}

fn field(key: &'static str, value: &TextEdit, label: &str, p: &Palette) -> El {
    text_input(value, type_::BODY.mono())
        .key(key)
        .label(label)
        .single_line()
        .placeholder(label, p.muted)
        .color(p.text)
        .grow(1.0)
        .shrink()
        .min_w(0.0)
        .h(39.0)
        .padding(10.0)
        .fill(p.input)
        .border(1.0, p.border)
        .radius(6.0)
        .focus_ring(2.0, 0.0, p.accent)
}

fn editor_text(key: &'static str, value: &TextEdit, placeholder: &str, p: &Palette) -> El {
    text_input(value, type_::BODY.mono())
        .key(key)
        .label(key)
        .color(p.text)
        .placeholder(placeholder, p.muted)
        .w_full()
        .h(90.0)
        .padding(10.0)
        .fill(p.input)
        .border(1.0, p.border)
        .radius(6.0)
        .focus_ring(2.0, 0.0, p.accent)
}

fn select(
    key: &'static str,
    label: &str,
    values: &[&str],
    value: &str,
    width: f32,
    state: &State,
) -> Select {
    Select::new(key, values)
        .label(label)
        .appearance(SelectAppearance::Field)
        .width(width)
        .current(Some(value))
        .open(state.menu == Some(key))
        .on_toggle(move |state: &mut State| state.menu = (state.menu != Some(key)).then_some(key))
        .on_close(|state: &mut State| state.menu = None)
}

fn editor(state: &State, p: &Palette, kit: &Kit, layers: &mut Vec<El>) -> El {
    let d = state.draft();
    let tabs = EDITORS.iter().map(|&name| {
        button(format!("edit-{name}"), name, state.editor == name, false, p)
            .on_press(move |s: &mut State| s.editor = name)
    });
    let (content, help) = match state.editor {
        "Parameters" => (
            editor_text("Query parameters", &d.query, "limit=20", p)
                .on_edit(|s: &mut State| &mut s.draft_mut().query),
            "Enter one name=value pair per line. Repeated names are retained.",
        ),
        "Headers" => (
            editor_text("Request headers", &d.headers, "Accept: application/json", p)
                .on_edit(|s: &mut State| &mut s.draft_mut().headers),
            "Enter one Name: value header per line.",
        ),
        "Body" if matches!(d.method.as_str(), "GET" | "HEAD") => (
            text("Choose a method that sends a request body.")
                .font(type_::BODY)
                .color(p.muted),
            "The draft body is preserved if you switch methods.",
        ),
        "Body" => (
            editor_text("Request body", &d.body, "Raw request body", p)
                .on_edit(|s: &mut State| &mut s.draft_mut().body),
            "Set Content-Type in Headers when the endpoint requires it.",
        ),
        _ => {
            let kind = select("auth", "Authentication", AUTH, &d.auth, 118.0, state)
                .on_choose(|s: &mut State, value, _| {
                    s.menu = None;
                    let draft = s.draft_mut();
                    if draft.auth != value {
                        draft.auth = value.into();
                        draft.identity = TextEdit::new("");
                        draft.secret = TextEdit::new("").secure();
                    }
                })
                .build(kit, layers);
            let mut controls = row().items_center().gap(8.0).w_full().child(kind);
            if matches!(d.auth.as_str(), "Basic" | "API key") {
                let label = if d.auth == "Basic" {
                    "Username"
                } else {
                    "Header name"
                };
                controls = controls.child(
                    field("identity", &d.identity, label, p)
                        .on_edit(|s: &mut State| &mut s.draft_mut().identity),
                );
            }
            if d.auth != "None" {
                controls = controls.child(
                    field("secret", &d.secret, "Credential value", p)
                        .secure()
                        .on_edit(|s: &mut State| &mut s.draft_mut().secret),
                );
            }
            (
                controls,
                "Credentials stay in this request tab until you close Relay.",
            )
        }
    };
    col()
        .w_full()
        .gap(8.0)
        .child(row().gap(4.0).children(tabs))
        .child(content)
        .child(text(help).font(type_::LABEL).color(p.muted).wrap())
}

fn response(state: &State, p: &Palette) -> El {
    let d = state.draft();
    let busy = state.active.as_ref().is_some_and(|(id, _)| *id == d.id);
    let mut title = row()
        .items_center()
        .justify_between()
        .gap(8.0)
        .child(text("Response").font(type_::TITLE).color(p.text));
    let content = if let Some(result) = &d.response {
        let status = format!(
            "{} {}  ·  {} ms  ·  {} B{}",
            result.status,
            result.reason,
            result.elapsed_ms,
            result.bytes,
            if result.truncated { " preview" } else { "" }
        );
        title = title.child(
            text(status)
                .font(type_::LABEL.mono())
                .color(if result.status >= 400 {
                    p.danger
                } else {
                    p.accent
                })
                .wrap(),
        );
        let tools = row()
            .items_center()
            .gap(5.0)
            .child(
                button("view-body", "Body", !state.show_headers, false, p).on_press(
                    |s: &mut State| {
                        s.show_headers = false;
                        s.notice.clear();
                    },
                ),
            )
            .child(
                button("view-headers", "Headers", state.show_headers, false, p).on_press(
                    |s: &mut State| {
                        s.show_headers = true;
                        s.notice.clear();
                    },
                ),
            )
            .child(
                button(
                    "copy",
                    if state.notice == "Copied" {
                        "Copied"
                    } else {
                        "Copy"
                    },
                    false,
                    false,
                    p,
                )
                .on_press(State::copy_response),
            )
            .child(text(&state.notice).font(type_::LABEL).color(p.muted));
        let body = if state.show_headers {
            &result.headers
        } else {
            &result.body
        };
        let end = body.floor_char_boundary(32 * 1024);
        let visible = &body[..end];
        col()
            .grow(1.0)
            .shrink()
            .gap(8.0)
            .child(tools)
            .child(
                col()
                    .key("response-body")
                    .w_full()
                    .grow(1.0)
                    .shrink()
                    .min_h(0.0)
                    .padding(12.0)
                    .fill(p.input)
                    .radius(6.0)
                    .scroll(ScrollSpec {
                        stick_bottom: false,
                    })
                    .child(
                        text(if body.is_empty() {
                            "No content"
                        } else {
                            visible
                        })
                        .font(type_::BODY.mono())
                        .color(p.text)
                        .w_full()
                        .wrap_anywhere()
                        .selectable(true),
                    ),
            )
            .child(if end < body.len() {
                text("Showing the first 32 KiB. Copy includes the full capture.")
                    .font(type_::LABEL)
                    .color(p.muted)
            } else {
                el()
            })
    } else {
        let (headline, detail) = if busy {
            ("Waiting for response", "Cancel stops the active request.")
        } else if d.outcome.is_empty() {
            (
                "Ready for a request",
                "Enter an HTTP or HTTPS URL and press Send.",
            )
        } else {
            ("Request did not complete", d.outcome.as_str())
        };
        col()
            .grow(1.0)
            .min_h(66.0)
            .gap(5.0)
            .padding(12.0)
            .fill(p.input)
            .radius(6.0)
            .child(text(headline).font(type_::TITLE).color(p.text))
            .child(
                text(detail)
                    .font(type_::BODY)
                    .color(if d.outcome.is_empty() {
                        p.muted
                    } else {
                        p.danger
                    })
                    .wrap(),
            )
    };
    col()
        .key("response")
        .grow(1.0)
        .shrink()
        .min_h(125.0)
        .gap(8.0)
        .padding(12.0)
        .radius(8.0)
        .border(1.0, p.border)
        .fill(p.surface)
        .child(title)
        .child(content)
}

pub fn view(state: &State, _: &mut Cx<State>) -> El {
    let p = palette(&state.theme);
    let kit = Kit::neutral(state.theme != "Paper");
    let mut layers = Vec::new();
    let theme = select("theme", "Color scheme", THEMES, &state.theme, 118.0, state)
        .on_choose(|s: &mut State, value, _| {
            s.theme = value.into();
            s.menu = None;
        })
        .build(&kit, &mut layers);
    let top = row()
        .h(56.0)
        .px(18.0)
        .items_center()
        .justify_between()
        .fill(p.surface)
        .child(
            row()
                .items_center()
                .gap(15.0)
                .child(
                    text("relay")
                        .font(TextStyle::new(24.0, 650.0).mono())
                        .color(p.text),
                )
                .child(
                    text("Desktop · 0.1.0 beta development")
                        .font(type_::LABEL)
                        .color(p.muted),
                ),
        )
        .child(theme);
    let tabs = state.drafts.iter().enumerate().map(|(index, draft)| {
        // IDs and methods keep credentials in URLs out of tab labels and history.
        button(
            format!("request-{}", draft.id),
            &format!("{}  #{}", draft.method, draft.id),
            index == state.selected,
            false,
            &p,
        )
        .on_press(move |s: &mut State| s.select(index))
    });
    let rail = col()
        .w(148.0)
        .padding(12.0)
        .gap(7.0)
        .fill(p.surface)
        .child(text("Requests").font(type_::TITLE).color(p.text))
        .child(button("new", "+ New request", false, false, &p).on_press_tx(State::new_draft))
        .child(
            button("import", "Import Postman", state.import_open, false, &p)
                .on_press_tx(State::open_import),
        )
        .child(
            col()
                .key("request-list")
                .gap(3.0)
                .max_h(225.0)
                .scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .children(tabs),
        )
        .child(text("Recent results").font(type_::TITLE).color(p.text))
        .child(
            col()
                .key("recent-results")
                .grow(1.0)
                .shrink()
                .gap(7.0)
                .scroll(ScrollSpec {
                    stick_bottom: false,
                })
                .children(
                    state
                        .history
                        .iter()
                        .map(|entry| text(entry).font(type_::LABEL.mono()).color(p.muted)),
                ),
        )
        .child(text("Session only").font(type_::LABEL).color(p.muted));
    let d = state.draft();
    let method = select("method", "HTTP method", METHODS, &d.method, 92.0, state)
        .on_choose(|s: &mut State, value, _| {
            s.draft_mut().method = value.into();
            s.menu = None;
        })
        .build(&kit, &mut layers);
    let target =
        field("url", &d.url, "Request URL", &p).on_edit(|s: &mut State| &mut s.draft_mut().url);
    let send = if state.active.is_some() {
        button("cancel", "Cancel", false, false, &p).on_press(State::cancel)
    } else {
        button("send", "Send  ↵", false, true, &p).on_press(State::send)
    };
    let workspace = col().grow(1.0).shrink().min_w(0.0).padding(14.0).gap(10.0);
    let workspace = if state.import_open {
        workspace.child(text("Import Postman collection").font(TextStyle::new(20.0, 650.0)).color(p.text))
            .child(text("Paste a Collection v2 export. Relay opens drafts with methods and base URLs. Add parameters, headers, bodies and auth after reviewing each draft.").font(type_::BODY).color(p.muted).wrap())
            .child(editor_text("Postman collection", &state.import_text, "Paste collection JSON", &p)
                .secure().on_edit(|s: &mut State| &mut s.import_text))
            .child(row().gap(8.0).child(button("import-submit", "Open request drafts", false, true, &p).on_press(State::import))
                .child(button("import-cancel", "Cancel", false, false, &p).on_press(State::cancel_import)))
            .child(text(&state.import_status).font(type_::BODY).color(p.danger).wrap())
    } else {
        workspace
            .child(
                row()
                    .items_center()
                    .justify_between()
                    .gap(8.0)
                    .child(
                        text(format!("Request {}", d.id))
                            .font(TextStyle::new(20.0, 650.0))
                            .color(p.text),
                    )
                    .child(
                        if state.drafts.len() > 1
                            && !state.active.as_ref().is_some_and(|(id, _)| *id == d.id)
                        {
                            button("close", "Close tab", false, false, &p)
                                .on_press(State::close_draft)
                        } else {
                            text("Ctrl+Enter to send").font(type_::LABEL).color(p.muted)
                        },
                    ),
            )
            .child(
                row()
                    .w_full()
                    .items_center()
                    .gap(7.0)
                    .child(method)
                    .child(target)
                    .child(send),
            )
            .child(editor(state, &p, &kit, &mut layers))
            .child(if state.notice.starts_with("Imported ") {
                text(&state.notice).font(type_::LABEL).color(p.accent)
            } else {
                el()
            })
            .child(response(state, &p))
    };
    col()
        .w_full()
        .h_full()
        .fill(p.canvas)
        .on_key_preview(crate::shortcut)
        .child(top)
        .child(
            row()
                .w_full()
                .grow(1.0)
                .shrink()
                .min_h(0.0)
                .child(rail)
                .child(workspace),
        )
        .children(layers)
}
