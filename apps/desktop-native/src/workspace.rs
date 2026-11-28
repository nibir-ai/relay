use rune::color::hex;
use rune::{
    Color, Cx, El, Icon, ScrollSpec, Span, TextEdit, TextStyle, col, el, icon, row, text,
    text_input,
};
use rune_kit::{Kit, PaletteFocus, PaletteSeed, Select, SelectAppearance};

use crate::{AUTH, EDITORS, Pair, ResponseView, State, THEMES, transport::METHODS};

const LABEL: TextStyle = TextStyle::new(12.0, 550.0);
const SMALL: TextStyle = TextStyle::new(11.0, 500.0);
const TITLE: TextStyle = TextStyle::new(15.0, 650.0);
const CODE: TextStyle = TextStyle::new(13.0, 430.0).mono();
const SCROLL: ScrollSpec = ScrollSpec {
    stick_bottom: false,
};

static RELAY: Icon = Icon {
    name: "relay-symbol",
    view: 40.0,
    body: r#"<path fill="currentColor" d="M5 8H11V12L15 8H29V14H18L11 21V34H5Z M22 28H36V34H22Z"/>"#,
};
static PLUS: Icon = Icon {
    name: "add",
    view: 16.0,
    body: r#"<path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>"#,
};
static IMPORT: Icon = Icon {
    name: "import",
    view: 16.0,
    body: r#"<path d="M8 2v8m-3-3 3 3 3-3M3 10v3h10v-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>"#,
};
static SEND: Icon = Icon {
    name: "send",
    view: 16.0,
    body: r#"<path d="M2.5 8h10M8 3.5 12.5 8 8 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>"#,
};
static CLOSE: Icon = Icon {
    name: "close",
    view: 16.0,
    body: r#"<path d="m4 4 8 8m0-8-8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>"#,
};
static CODE_ICON: Icon = Icon {
    name: "response",
    view: 24.0,
    body: r#"<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-2-13-4 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>"#,
};

struct Palette {
    canvas: Color,
    rail: Color,
    panel: Color,
    input: Color,
    edge: Color,
    text: Color,
    muted: Color,
    accent: Color,
    ink: Color,
    danger: Color,
    amber: Color,
    green: Color,
    light: bool,
}

fn color(value: &str) -> Color {
    hex(value).expect("valid theme color")
}

fn palette(theme: &str) -> Palette {
    let colors = match theme {
        "One Dark" => [
            "#21242c", "#1b1e25", "#272b34", "#1e2128", "#383e4a", "#edf0f7", "#a9b1c3", "#79c1ff",
            "#111d28",
        ],
        "Gruvbox" => [
            "#282522", "#211e1c", "#302c27", "#23201d", "#484038", "#f7e7cb", "#c8b398", "#eac171",
            "#241b10",
        ],
        "Nord" => [
            "#272d3a", "#202531", "#303746", "#232a36", "#434e62", "#edf3fc", "#b9c5d9", "#96c9e2",
            "#15242d",
        ],
        "Paper" => [
            "#f5f6f3", "#eeefeb", "#ffffff", "#fbfcf9", "#d3dad5", "#1c2b29", "#53645e", "#146b58",
            "#ffffff",
        ],
        _ => [
            "#161e22", "#11181c", "#1a2529", "#11191d", "#344248", "#eaf2f1", "#a5b6b9", "#8ce1bf",
            "#132820",
        ],
    };
    let [canvas, rail, panel, input, edge, text, muted, accent, ink] = colors.map(color);
    let light = theme == "Paper";
    Palette {
        canvas,
        rail,
        panel,
        input,
        edge,
        text,
        muted,
        accent,
        ink,
        light,
        danger: color(if light { "#98383d" } else { "#ff9da3" }),
        amber: color(if light { "#855a24" } else { "#edc37b" }),
        green: color(if light { "#226d49" } else { "#8bd7ab" }),
    }
}

fn method_color(method: &str, p: &Palette) -> Color {
    match method {
        "GET" => p.green,
        "POST" => p.amber,
        "DELETE" => p.danger,
        "PUT" | "PATCH" => color(if p.light { "#2f62a7" } else { "#9dbffc" }),
        _ => p.muted,
    }
}

fn status_color(status: u16, p: &Palette) -> Color {
    match status {
        200..=299 => p.green,
        300..=399 => p.amber,
        400.. => p.danger,
        _ => p.muted,
    }
}

fn caption(value: impl Into<String>, p: &Palette) -> El {
    text(value.into()).font(SMALL).color(p.muted)
}

fn button(key: &str, label: &str, glyph: Option<&'static Icon>, primary: bool, p: &Palette) -> El {
    let (bg, ink, hover) = if primary {
        (
            p.accent,
            p.ink,
            p.accent.mix(p.text, if p.light { 0.10 } else { 0.22 }),
        )
    } else {
        (p.panel, p.text, p.panel.mix(p.text, 0.08))
    };
    let mut content = row().items_center().gap(7.0);
    if let Some(glyph) = glyph {
        content = content.child(icon(glyph, 14.0).color(ink));
    }
    content = content.child(text(label).font(LABEL).color(ink));
    el().key(key)
        .role("button")
        .label(label)
        .focusable(true)
        .press_on_return()
        .h(34.0)
        .px(11.0)
        .center()
        .radius(6.0)
        .fill(bg)
        .hover_fill(hover)
        .focus_ring(2.0, 1.0, p.accent)
        .child(content)
}

fn close_button(key: String, label: &str, p: &Palette) -> El {
    el().key(key)
        .role("button")
        .label(label)
        .focusable(true)
        .press_on_return()
        .size(28.0, 28.0)
        .center()
        .radius(5.0)
        .hover_fill(p.panel.mix(p.text, 0.09))
        .focus_ring(2.0, 0.0, p.accent)
        .child(icon(&CLOSE, 14.0).color(p.muted))
}

fn tab(key: String, label: &str, selected: bool, p: &Palette) -> El {
    el().key(key)
        .role("tab")
        .label(label)
        .focus_selected(selected)
        .focusable(true)
        .press_on_return()
        .h(37.0)
        .px(10.0)
        .center()
        .border_sides(
            [0.0, 0.0, 2.0, 0.0],
            if selected {
                p.accent
            } else {
                Color::TRANSPARENT
            },
        )
        .hover_fill(p.panel.mix(p.text, 0.06))
        .focus_ring(2.0, -2.0, p.accent)
        .child(
            text(label)
                .font(LABEL)
                .color(if selected { p.text } else { p.muted }),
        )
}

fn field(key: impl Into<String>, value: &TextEdit, label: &str, hint: &str, p: &Palette) -> El {
    text_input(value, CODE)
        .key(key)
        .label(label)
        .single_line()
        .placeholder(hint, p.muted)
        .color(p.text)
        .grow(1.0)
        .shrink()
        .min_w(0.0)
        .h(33.0)
        .px(9.0)
        .py(7.0)
        .fill(p.input)
        .radius(4.0)
        .focus_ring(2.0, -1.0, p.accent)
}

fn editor_text(key: &'static str, value: &TextEdit, hint: &str, height: f32, p: &Palette) -> El {
    text_input(value, CODE)
        .key(key)
        .label(key)
        .placeholder(hint, p.muted)
        .color(p.text)
        .w_full()
        .h(height)
        .padding(10.0)
        .fill(p.input)
        .border(1.0, p.edge)
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

fn pair_table(state: &State, headers: bool, p: &Palette) -> El {
    let d = state.draft();
    let entries = if headers { &d.headers } else { &d.query };
    let kind = if headers { "header" } else { "parameter" };
    fn rows(state: &mut State, headers: bool) -> &mut Vec<Pair> {
        let draft = state.draft_mut();
        if headers {
            &mut draft.headers
        } else {
            &mut draft.query
        }
    }
    let items = entries.iter().enumerate().map(|(i, entry)| {
        let name_key = format!("{kind}-name-{i}");
        let value_key = format!("{kind}-value-{i}");
        row()
            .key(format!("{kind}-row-{i}"))
            .w_full()
            .items_center()
            .gap(8.0)
            .child(
                field(
                    name_key,
                    &entry.name,
                    &format!("{kind} {} name", i + 1),
                    "Name",
                    p,
                )
                .on_edit(move |s: &mut State| &mut rows(s, headers)[i].name),
            )
            .child(
                field(
                    value_key,
                    &entry.value,
                    &format!("{kind} {} value", i + 1),
                    "Value",
                    p,
                )
                .on_edit(move |s: &mut State| &mut rows(s, headers)[i].value),
            )
            .child(
                close_button(
                    format!("remove-{kind}-{i}"),
                    &format!("Remove {kind} {}", i + 1),
                    p,
                )
                .on_press_tx(move |s: &mut State, tx| {
                    let entries = rows(s, headers);
                    entries.remove(i);
                    if entries.is_empty() {
                        entries.push(Pair::new("", ""));
                    }
                    tx.focus(format!("{kind}-name-{}", i.min(entries.len() - 1)), true);
                }),
            )
    });
    let add = if entries.len() < 100 {
        button("add-pair", "Add row", Some(&PLUS), false, p).on_press_tx(
            move |s: &mut State, tx| {
                let entries = rows(s, headers);
                let i = entries.len();
                if i < 100 {
                    entries.push(Pair::new("", ""));
                    let key = format!("{kind}-name-{i}");
                    tx.scroll_into_view(key.clone());
                    tx.focus_when_shown(key, true);
                }
            },
        )
    } else {
        caption("100 rows", p)
    };
    col()
        .w_full()
        .padding(7.0)
        .gap(4.0)
        .child(
            row()
                .items_center()
                .justify_between()
                .px(4.0)
                .child(caption(
                    if headers {
                        "Request headers"
                    } else {
                        "URL query parameters"
                    },
                    p,
                ))
                .child(add),
        )
        .child(
            col()
                .key("request-pairs")
                .w_full()
                .gap(4.0)
                .max_h(74.0)
                .shrink()
                .scroll(SCROLL)
                .children(items),
        )
}

fn auth(state: &State, p: &Palette, kit: &Kit, layers: &mut Vec<El>) -> El {
    let d = state.draft();
    let select = select("auth", "Authentication", AUTH, &d.auth, 105.0, state)
        .on_choose(|s: &mut State, value, _| {
            s.menu = None;
            let draft = s.draft_mut();
            if draft.auth != value {
                draft.auth = value.into();
                draft.identity = TextEdit::new("");
                draft.secret = TextEdit::new("").secure();
            }
        })
        .build(kit, layers)
        .press_on_return();
    let mut controls = row().items_center().gap(7.0).child(select);
    if matches!(d.auth.as_str(), "Basic" | "API key") {
        let label = if d.auth == "Basic" {
            "Username"
        } else {
            "Header name"
        };
        controls = controls.child(
            field("identity", &d.identity, label, label, p)
                .on_edit(|s: &mut State| &mut s.draft_mut().identity),
        );
    }
    if d.auth != "None" {
        controls = controls.child(
            field(
                "secret",
                &d.secret,
                "Credential value",
                "Credential value",
                p,
            )
            .secure()
            .on_edit(|s: &mut State| &mut s.draft_mut().secret),
        );
    }
    col()
        .w_full()
        .padding(10.0)
        .gap(8.0)
        .child(controls)
        .child(caption(
            "Credentials are scoped to this tab for the session.",
            p,
        ))
}

fn composer(state: &State, p: &Palette, kit: &Kit, layers: &mut Vec<El>) -> El {
    let d = state.draft();
    let method = select("method", "HTTP method", METHODS, &d.method, 86.0, state)
        .on_choose(|s: &mut State, value, _| {
            s.draft_mut().method = value.into();
            s.menu = None;
        })
        .build(kit, layers)
        .press_on_return();
    let target = field(
        "url",
        &d.url,
        "Request URL",
        "https://api.example.com/v1",
        p,
    )
    .on_edit(|s: &mut State| &mut s.draft_mut().url);
    let send = if state.active.is_some() {
        button("request-action", "Cancel", None, false, p).on_press(State::cancel)
    } else {
        button("request-action", "Send", Some(&SEND), true, p).on_press(State::send)
    };
    let editor = match state.editor {
        "Parameters" => pair_table(state, false, p),
        "Headers" => pair_table(state, true, p),
        "Body" if matches!(d.method.as_str(), "GET" | "HEAD") => col().padding(12.0).child(
            caption("Choose a different method to send a request body.", p),
        ),
        "Body" => col().padding(8.0).child(
            editor_text("Request body", &d.body, "Enter a request body", 82.0, p)
                .on_edit(|s: &mut State| &mut s.draft_mut().body),
        ),
        _ => auth(state, p, kit, layers),
    };
    col()
        .w_full()
        .gap(9.0)
        .child(
            row()
                .items_center()
                .w_full()
                .gap(7.0)
                .padding(5.0)
                .radius(8.0)
                .fill(p.input)
                .border(1.0, p.edge)
                .child(method)
                .child(target)
                .child(send),
        )
        .child(
            col()
                .w_full()
                .fill(p.panel)
                .radius(8.0)
                .border(1.0, p.edge)
                .child(
                    row()
                        .role("tablist")
                        .focus_group()
                        .label("Request editor")
                        .px(5.0)
                        .border_sides([0.0, 0.0, 1.0, 0.0], p.edge)
                        .children(EDITORS.iter().map(|&name| {
                            tab(format!("edit-{name}"), name, state.editor == name, p)
                                .on_press(move |s: &mut State| s.editor = name)
                        })),
                )
                .child(editor),
        )
}

fn response(state: &State, p: &Palette, kit: &Kit) -> El {
    let d = state.draft();
    let busy = state.active.as_ref().is_some_and(|(id, _)| *id == d.id);
    let top = row()
        .items_center()
        .justify_between()
        .px(12.0)
        .h(38.0)
        .border_sides([0.0, 0.0, 1.0, 0.0], p.edge)
        .child(text("Response").font(TITLE).color(p.text));
    let (top, content) = if let Some(result) = &d.response {
        let tone = status_color(result.status, p);
        let status = row()
            .items_center()
            .gap(10.0)
            .child(
                el().h(23.0)
                    .px(7.0)
                    .center()
                    .radius(4.0)
                    .fill(p.panel.mix(tone, if p.light { 0.11 } else { 0.07 }))
                    .child(
                        text(format!("{} {}", result.status, result.reason))
                            .font(LABEL)
                            .color(tone),
                    ),
            )
            .child(caption(format!("{} ms", result.elapsed_ms), p))
            .child(caption(format!("{} B", result.bytes), p));
        let formatted = result
            .pretty_body
            .as_ref()
            .filter(|_| state.response_view == ResponseView::Body);
        let body = match state.response_view {
            ResponseView::Headers => &result.headers,
            ResponseView::Raw => &result.body,
            ResponseView::Body => formatted.map(|json| &json.text).unwrap_or(&result.body),
        };
        let viewing_headers = state.response_view == ResponseView::Headers;
        let end = body.floor_char_boundary(32 * 1024);
        let mut payload = text(if body.is_empty() {
            "No content"
        } else {
            &body[..end]
        })
        .font(CODE)
        .color(p.text)
        .w_full()
        .wrap_anywhere()
        .selectable(true);
        if let Some(json) = formatted {
            let key_color = color(if p.light { "#2e649a" } else { "#a7c7eb" });
            payload = payload.spans(
                json.strings
                    .iter()
                    .map(|value| {
                        Span::new(value.start, value.end).color(if value.is_key {
                            key_color
                        } else {
                            p.green
                        })
                    })
                    .collect::<Vec<_>>(),
            );
        }
        let content = col()
            .grow(1.0)
            .shrink()
            .min_h(0.0)
            .child(
                row()
                    .items_center()
                    .justify_between()
                    .px(5.0)
                    .border_sides([0.0, 0.0, 1.0, 0.0], p.edge)
                    .child(
                        row()
                            .role("tablist")
                            .focus_group()
                            .label("Response views")
                            .children(
                                [ResponseView::Body, ResponseView::Raw, ResponseView::Headers]
                                    .into_iter()
                                    .map(|view| {
                                        tab(
                                            format!("view-{}", view.label().to_ascii_lowercase()),
                                            view.label(),
                                            state.response_view == view,
                                            p,
                                        )
                                        .on_press(
                                            move |s: &mut State| {
                                                s.response_view = view;
                                                s.notice.clear();
                                            },
                                        )
                                    }),
                            ),
                    )
                    .child(
                        button(
                            "copy",
                            if state.notice.is_empty() {
                                if viewing_headers {
                                    "Copy headers"
                                } else {
                                    "Copy raw"
                                }
                            } else {
                                &state.notice
                            },
                            None,
                            false,
                            p,
                        )
                        .on_press(State::copy_response),
                    ),
            )
            .child(
                kit.scroll_bar(
                    col()
                        .key("response-body")
                        .role("region")
                        .label("Response content")
                        .focusable(true)
                        .focus_ring(2.0, -2.0, p.accent)
                        .w_full()
                        .grow(1.0)
                        .shrink()
                        .min_h(0.0)
                        .padding(13.0)
                        .fill(p.input)
                        .scroll(SCROLL)
                        .child(payload),
                ),
            )
            .child(
                row()
                    .h(27.0)
                    .px(11.0)
                    .items_center()
                    .justify_between()
                    .border_sides([1.0, 0.0, 0.0, 0.0], p.edge)
                    .child(
                        caption(
                            if viewing_headers {
                                "HTTP response headers"
                            } else if result.content_type.is_empty() {
                                "Response text"
                            } else {
                                &result.content_type
                            },
                            p,
                        )
                        .shrink()
                        .truncate(),
                    )
                    .child(caption(
                        if result.truncated {
                            "Capture limited to 2 MiB"
                        } else if end < body.len() {
                            "32 KiB shown · Copy includes full capture"
                        } else {
                            ""
                        },
                        p,
                    )),
            );
        (top.child(status), content)
    } else {
        let (title, detail, tone) = if busy {
            (
                "Waiting for the server",
                "You can cancel the active request.",
                p.accent,
            )
        } else if d.outcome.is_empty() {
            (
                "No response yet",
                "Send a request to see the status, headers and body.",
                p.muted,
            )
        } else {
            ("Request did not complete", d.outcome.as_str(), p.danger)
        };
        (
            top,
            col()
                .grow(1.0)
                .shrink()
                .min_h(70.0)
                .center()
                .padding(12.0)
                .gap(5.0)
                .fill(p.input)
                .child(icon(&CODE_ICON, 23.0).color(tone))
                .child(text(title).font(TITLE).color(p.text))
                .child(caption(detail, p).wrap()),
        )
    };
    col()
        .key("response")
        .w_full()
        .grow(1.0)
        .shrink()
        .min_h(131.0)
        .radius(8.0)
        .clip_rounded(8.0)
        .fill(p.panel)
        .border(1.0, p.edge)
        .child(top)
        .child(content)
}

fn sidebar(state: &State, p: &Palette) -> El {
    let drafts = state.drafts.iter().enumerate().map(|(index, draft)| {
        let title = draft.title();
        let current = index == state.selected && !state.import_open;
        row()
            .key(format!("request-{}", draft.id))
            .role("option")
            .label(format!("{} {title}", draft.method))
            .focus_selected(current)
            .focusable(true)
            .w_full()
            .h(35.0)
            .items_center()
            .gap(6.0)
            .px(8.0)
            .radius(5.0)
            .fill(if current {
                p.accent.alpha(0.12)
            } else {
                Color::TRANSPARENT
            })
            .hover_fill(p.panel.mix(p.text, 0.05))
            .focus_ring(2.0, -1.0, p.accent)
            .border_sides(
                [0.0, 0.0, 0.0, 2.0],
                if current {
                    p.accent
                } else {
                    Color::TRANSPARENT
                },
            )
            .child(
                text(&draft.method)
                    .font(SMALL.mono())
                    .color(method_color(&draft.method, p))
                    .w(45.0),
            )
            .child(
                text(title)
                    .font(LABEL)
                    .color(p.text)
                    .grow(1.0)
                    .shrink()
                    .min_w(0.0)
                    .truncate(),
            )
            .on_press(move |s: &mut State| s.select(index))
    });
    let history = state.history.iter().map(|entry| {
        row()
            .items_center()
            .gap(6.0)
            .px(7.0)
            .h(24.0)
            .child(
                text(&entry.method)
                    .font(SMALL.mono())
                    .color(p.muted)
                    .w(47.0),
            )
            .child(
                text(entry.status.to_string())
                    .font(SMALL.mono())
                    .color(status_color(entry.status, p)),
            )
            .child(caption(format!("{} ms", entry.elapsed_ms), p))
    });
    let recent = col()
        .key("recent-results")
        .grow(1.0)
        .shrink()
        .min_h(0.0)
        .scroll(SCROLL);
    col()
        .w(179.0)
        .fill(p.rail)
        .padding(10.0)
        .gap(7.0)
        .border_sides([0.0, 1.0, 0.0, 0.0], p.edge)
        .child(button("new", "New request", Some(&PLUS), false, p).on_press_tx(State::new_draft))
        .child(
            button("import", "Import Postman", Some(&IMPORT), false, p)
                .on_press_tx(State::open_import),
        )
        .child(
            row()
                .items_center()
                .justify_between()
                .h(22.0)
                .px(4.0)
                .child(caption("REQUESTS", p))
                .child(caption(state.drafts.len().to_string(), p)),
        )
        .child(
            col()
                .key("request-list")
                .role("listbox")
                .label("Requests")
                .focus_group()
                .focus_follows()
                .gap(3.0)
                .max_h(181.0)
                .shrink()
                .scroll(SCROLL)
                .children(drafts),
        )
        .child(
            row()
                .items_center()
                .h(26.0)
                .px(4.0)
                .border_sides([1.0, 0.0, 0.0, 0.0], p.edge)
                .child(caption("RECENT RESULTS", p)),
        )
        .child(if state.history.is_empty() {
            recent.child(caption("Responses appear here", p))
        } else {
            recent.children(history)
        })
        .child(caption("Session only", p))
}

fn import_view(state: &State, p: &Palette) -> El {
    col()
        .gap(11.0)
        .child(
            text("Import Postman collection")
                .font(TextStyle::new(23.0, 650.0))
                .color(p.text),
        )
        .child(
            caption(
                "Paste a Collection v2 export to open editable drafts with methods and URLs.",
                p,
            )
            .wrap(),
        )
        .child(
            editor_text(
                "Postman collection",
                &state.import_text,
                "Paste collection JSON",
                115.0,
                p,
            )
            .secure()
            .on_edit(|s: &mut State| &mut s.import_text),
        )
        .child(
            row()
                .gap(8.0)
                .child(
                    button(
                        "import-submit",
                        "Open request drafts",
                        Some(&IMPORT),
                        true,
                        p,
                    )
                    .on_press_tx(State::import),
                )
                .child(
                    button("import-cancel", "Cancel", None, false, p)
                        .on_press_tx(State::dismiss_import),
                ),
        )
        .child(
            text(&state.import_status)
                .font(LABEL)
                .color(p.danger)
                .wrap(),
        )
}

pub fn view(state: &State, _: &mut Cx<State>) -> El {
    let p = palette(&state.theme);
    let kit = Kit::from_palette_focus(
        PaletteSeed {
            bg: p.canvas,
            fg: p.text,
            accent: p.accent,
        },
        PaletteFocus::Accent,
    );
    let mut layers = Vec::new();
    let theme = select("theme", "Color scheme", THEMES, &state.theme, 116.0, state)
        .on_choose(|s: &mut State, value, _| {
            s.theme = value.into();
            s.menu = None;
        })
        .build(&kit, &mut layers)
        .press_on_return();
    let top = row()
        .h(46.0)
        .px(13.0)
        .items_center()
        .justify_between()
        .fill(p.rail)
        .border_sides([0.0, 0.0, 1.0, 0.0], p.edge)
        .child(
            row()
                .items_center()
                .gap(9.0)
                .child(
                    el().size(26.0, 26.0)
                        .center()
                        .radius(6.0)
                        .fill(p.accent)
                        .child(icon(&RELAY, 18.0).color(p.ink)),
                )
                .child(
                    text("Relay")
                        .font(TextStyle::new(16.0, 675.0))
                        .color(p.text),
                )
                .child(caption("/   Local workspace", &p)),
        )
        .child(theme);
    let workspace = col()
        .grow(1.0)
        .shrink()
        .min_w(0.0)
        .min_h(0.0)
        .padding(12.0)
        .gap(9.0);
    let workspace = if state.import_open {
        workspace.child(import_view(state, &p))
    } else {
        let d = state.draft();
        let title = text_input(&d.name, TextStyle::new(19.0, 650.0))
            .key("request-name")
            .label("Request name")
            .single_line()
            .placeholder(format!("Request {}", d.id), p.text)
            .color(p.text)
            .grow(1.0)
            .min_w(0.0)
            .shrink()
            .h(28.0)
            .px(4.0)
            .radius(4.0)
            .hover_fill(p.panel)
            .focus_ring(2.0, -1.0, p.accent)
            .on_edit(|s: &mut State| &mut s.draft_mut().name);
        let mut heading = row()
            .items_center()
            .gap(9.0)
            .child(title)
            .child(caption("Ctrl+Enter", &p));
        if state.drafts.len() > 1 && !state.active.as_ref().is_some_and(|(id, _)| *id == d.id) {
            heading = heading.child(
                close_button("close".into(), "Close request", &p).on_press_tx(State::close_draft),
            );
        }
        let mut work = workspace
            .child(heading)
            .child(composer(state, &p, &kit, &mut layers));
        if state.notice.starts_with("Imported ") {
            work = work.child(caption(&state.notice, &p));
        }
        work.child(response(state, &p, &kit))
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
                .child(sidebar(state, &p))
                .child(workspace),
        )
        .children(layers)
}
