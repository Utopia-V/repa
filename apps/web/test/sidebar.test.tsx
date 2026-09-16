import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { routes } from "../src/routes";
import { mockMatchMedia } from "./match-media";

beforeEach(() => { mockMatchMedia(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderWorkspace(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

it("默认进入 Sources，工作区为空，展示空间提示和会话列表", async () => {
  const router = renderWorkspace();
  await waitFor(() => expect(router.state.location.pathname).toBe("/sources"));
  expect(screen.getByRole("link", { name: "Sources 知识图" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("main", { name: "工作区" }).innerHTML).toBe("");
  expect(screen.getByText("尚未选择学习空间")).toBeTruthy();
  expect(screen.getByRole("link", { name: "OS Exam Prep" })).toBeTruthy();
});

it("导航和历史使用路由状态，切换页面不会重置会话折叠状态", async () => {
  const router = renderWorkspace("/sources");
  fireEvent.click(screen.getByRole("button", { name: "Chat" }));
  expect(screen.queryByRole("link", { name: "OS Exam Prep" })).toBeNull();
  for (const [label, path] of [["Goals", "/goals"], ["Wiki", "/wiki"], ["History", "/history"], ["Settings", "/settings"]] as const) {
    fireEvent.click(screen.getByRole("link", { name: label }));
    await waitFor(() => expect(router.state.location.pathname).toBe(path));
    expect(screen.getByRole("link", { name: label }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("main").innerHTML).toBe("");
  }
  await act(() => router.navigate(-1));
  expect(screen.getByRole("link", { name: "History" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("button", { name: "Chat" }).getAttribute("aria-expanded")).toBe("false");
});

it("会话深链接能恢复当前项，知识树地址归属 Sources", async () => {
  const router = renderWorkspace("/chat/demo-os-exam");
  expect(screen.getByRole("link", { name: "OS Exam Prep" }).getAttribute("aria-current")).toBe("page");
  await act(() => router.navigate("/sources/demo-book/knowledge-tree"));
  expect(screen.getByRole("link", { name: "Sources 知识图" }).getAttribute("aria-current")).toBe("page");
});

it("导航抽屉可关闭、恢复焦点，选择目标后关闭并保留当前路由", async () => {
  mockMatchMedia(true);
  const router = renderWorkspace("/sources");
  const trigger = screen.getByRole("button", { name: "打开导航" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "工作台导航" });
  fireEvent.click(within(dialog).getByRole("link", { name: "Goals" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/goals"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("回到桌面宽度时释放抽屉的模态焦点约束", async () => {
  const media = mockMatchMedia(true);
  renderWorkspace("/sources");
  fireEvent.click(screen.getByRole("button", { name: "打开导航" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  act(() => { media.matches = false; media.dispatchEvent(new Event("change")); });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});


it("Chat 整行切换栏目，会话链接负责导航", async () => {
  const router = renderWorkspace("/sources");
  const trigger = screen.getByRole("button", { name: "Chat" });
  expect(screen.queryByRole("link", { name: "Chat" })).toBeNull();
  fireEvent.click(within(trigger).getByText("Chat"));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("link", { name: "OS Exam Prep" })).toBeNull();
  expect(router.state.location.pathname).toBe("/sources");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("link", { name: "OS Exam Prep" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/chat/demo-os-exam"));
});


it("Sidebar 的桌面开关可收起并重新打开导航", () => {
  renderWorkspace("/sources");
  fireEvent.click(screen.getByRole("button", { name: "收起导航" }));
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("collapsed");
  const openButtons = screen.getAllByRole("button", { name: "打开导航" });
  fireEvent.click(openButtons[openButtons.length - 1]!);
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("expanded");
});


it("折叠为图标栏后保留可访问名称与当前项", () => {
  renderWorkspace("/sources");
  fireEvent.click(screen.getByRole("button", { name: "收起导航" }));
  const sidebar = document.querySelector('[data-slot="sidebar"]');
  expect(sidebar?.getAttribute("data-state")).toBe("collapsed");
  expect(sidebar?.getAttribute("data-collapsible")).toBe("icon");
  // 文字由 CSS 在视觉上隐藏，但链接名称和当前项仍可被辅助技术识别。
  expect(screen.getByRole("link", { name: "Sources 知识图" }).getAttribute("aria-current")).toBe("page");
  // 折叠时用 title 为鼠标用户补回标签，展开后移除。
  expect(screen.getByRole("link", { name: "Goals" }).getAttribute("title")).toBe("Goals");
  fireEvent.click(screen.getByRole("button", { name: "打开导航" }));
  expect(screen.getByRole("link", { name: "Goals" }).getAttribute("title")).toBeNull();
});


it("折叠时点击 Chat 会展开侧栏并保持会话组打开", () => {
  renderWorkspace("/sources");
  fireEvent.click(screen.getByRole("button", { name: "收起导航" }));
  fireEvent.click(screen.getByRole("button", { name: "Chat" }));
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("expanded");
  expect(screen.getByRole("button", { name: "Chat" }).getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("link", { name: "OS Exam Prep" })).toBeTruthy();
});


it("折叠时会话深链接仍将 Chat 标记为当前项", () => {
  renderWorkspace("/chat/demo-os-exam");
  fireEvent.click(screen.getByRole("button", { name: "收起导航" }));
  expect(screen.getByRole("button", { name: "Chat" }).getAttribute("data-active")).toBe("true");
});


it("侧栏边缘把手可切换展开与收起", () => {
  renderWorkspace("/sources");
  const rail = screen.getByRole("button", { name: "切换侧栏" });
  fireEvent.click(rail);
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("collapsed");
  fireEvent.click(rail);
  expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("expanded");
});


it("拖动改宽、拖窄收起、向外展开，并清理拖动状态", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  renderWorkspace("/sources");
  const rail = screen.getByRole("button", { name: "切换侧栏" });
  const wrapper = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!;
  const container = document.querySelector<HTMLElement>('[data-slot="sidebar-container"]')!;
  const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ width: 280 } as DOMRect);
  fireEvent.pointerDown(rail, { clientX: 280, button: 0 });
  fireEvent.pointerMove(rail, { clientX: 350 });
  expect(wrapper.style.getPropertyValue("--sidebar-width")).toContain("350px");
  expect(document.body.style.userSelect).toBe("none");
  fireEvent.pointerUp(rail);
  fireEvent.click(rail);
  expect(sidebar.dataset.state).toBe("expanded");
  expect(document.body.style.userSelect).toBe("");
  expect(wrapper.dataset.resizing).toBeUndefined();
  fireEvent.pointerDown(rail, { clientX: 280, button: 0 });
  fireEvent.pointerMove(rail, { clientX: 190 });
  expect(wrapper.dataset.resizing).toBeUndefined();
  fireEvent.pointerUp(rail);
  expect(sidebar.dataset.state).toBe("collapsed");
  vi.mocked(container.getBoundingClientRect).mockReturnValue({ width: 56 } as DOMRect);
  fireEvent.pointerDown(rail, { clientX: 56, button: 0 });
  fireEvent.pointerMove(rail, { clientX: 80 });
  fireEvent.pointerMove(rail, { clientX: 100 });
  expect(sidebar.dataset.state).toBe("collapsed");
  fireEvent.pointerMove(rail, { clientX: 210 });
  expect(sidebar.dataset.state).toBe("expanded");
  expect(wrapper.dataset.resizing).toBeUndefined();
  fireEvent.pointerCancel(rail);
  expect(document.body.style.userSelect).toBe("");
  fireEvent.keyDown(rail, { key: "Home" });
  expect(wrapper.style.getPropertyValue("--sidebar-width")).toContain("280px");
});
