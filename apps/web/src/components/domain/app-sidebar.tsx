import { ChevronDown, FolderOpen, MessageCircle, Settings } from "lucide-react";
import { Collapsible } from "radix-ui";
import { NavLink, useLocation } from "react-router";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { workspaceSections } from "./sidebar-data";

type Conversation = { readonly id: string; readonly title: string };

/** 折叠栏中隐藏文字，同时保留可访问名称。 */
const collapseLabel = "group-data-[collapsible=icon]:sr-only";

export function AppSidebar({ conversations, chatExpanded, onChatExpandedChange }: {
  conversations: readonly Conversation[];
  chatExpanded: boolean;
  onChatExpandedChange: (expanded: boolean) => void;
}) {
  const { open, state, isMobile, setOpen, setOpenMobile } = useSidebar();
  const location = useLocation();
  const closeMobileSidebar = () => setOpenMobile(false);
  const chatActive = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  // 折叠后文字不可见，用原生 title 给鼠标用户保留标签，不引入额外浮层组件。
  const collapsedTitle = (label: string) => (state === "collapsed" ? label : undefined);
  // 会话列表折叠后靠高度过渡隐藏，需一并退出键盘与辅助技术导航。
  const submenuHidden = state === "collapsed" && !isMobile;

  // 折叠状态下点击 Chat 先展开侧栏，否则点击后看不到会话列表。
  const handleChatToggle = (expanded: boolean) => {
    if (!open) {
      setOpen(true);
      onChatExpandedChange(true);
      return;
    }
    onChatExpandedChange(expanded);
  };

  return <Sidebar aria-label="应用侧栏" collapsible="icon">
    <SidebarHeader>
      <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
        <h1 className={`m-0 text-xl ${collapseLabel}`}>Repa</h1>
        <SidebarTrigger />
      </div>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <nav aria-label="主导航">
          <SidebarMenu>
            <Collapsible.Root asChild open={chatExpanded} onOpenChange={handleChatToggle}>
              <SidebarMenuItem>
                <Collapsible.Trigger asChild>
                  <SidebarMenuButton isActive={chatActive} title={collapsedTitle("Chat")}>
                    <MessageCircle aria-hidden="true" />
                    <span className={collapseLabel}>Chat</span>
                    <ChevronDown aria-hidden="true" className={`ml-auto group-data-[collapsible=icon]:hidden ${chatExpanded ? "" : "-rotate-90"}`} />
                  </SidebarMenuButton>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  {/* 折叠时用行高过渡收起会话，避免列表项在展开动画中瞬时上移。 */}
                  <div inert={submenuHidden || undefined} className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-linear group-data-[collapsible=icon]:grid-rows-[0fr]">
                    <div className="overflow-hidden">
                      <SidebarMenuSub>
                        {conversations.map((conversation) => <SidebarMenuSubItem key={conversation.id}>
                          <SidebarMenuSubButton asChild>
                            <NavLink to={`/chat/${conversation.id}`} onClick={closeMobileSidebar} title={conversation.title}><span>{conversation.title}</span></NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>)}
                      </SidebarMenuSub>
                    </div>
                  </div>
                </Collapsible.Content>
              </SidebarMenuItem>
            </Collapsible.Root>
            {workspaceSections.map(({ path, label, icon: Icon }) => <SidebarMenuItem key={path}>
              <SidebarMenuButton asChild>
                <NavLink to={`/${path}`} onClick={closeMobileSidebar} title={collapsedTitle(label)}><Icon aria-hidden="true" /><span className={collapseLabel}>{label}</span></NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </nav>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <div title={collapsedTitle("本地学习空间：尚未选择学习空间")} className="overflow-hidden rounded-md border border-solid border-border bg-surface-inset p-3 transition-[padding] duration-300 ease-linear group-data-[collapsible=icon]:grid group-data-[collapsible=icon]:min-h-10 group-data-[collapsible=icon]:place-content-center group-data-[collapsible=icon]:place-items-center group-data-[collapsible=icon]:p-0">
        <div className="flex items-center gap-2 text-xs">
          <FolderOpen aria-hidden="true" className="size-4 shrink-0" />
          <span className={collapseLabel}>本地学习空间</span>
        </div>
        <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-linear group-data-[collapsible=icon]:grid-rows-[0fr]">
          <div className="overflow-hidden">
            <p className="m-0 mt-2 text-xs text-muted-foreground">尚未选择学习空间</p>
          </div>
        </div>
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <NavLink to="/settings" onClick={closeMobileSidebar} title={collapsedTitle("Settings")}><Settings aria-hidden="true" /><span className={collapseLabel}>Settings</span></NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}
