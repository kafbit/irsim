"use client";

import type { SectionColor } from "../lib/canvas-layout";
import { formatNumber } from "../lib/format-number";
import { Input, cn } from "../ui";
import { ChevronDown, Play } from "../ui/icons";
import Link from "next/link";
import {
  Fragment,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useState,
} from "react";
import { CHROME_FORMAT } from "./chrome-format";
import { PageMenu } from "./page-menu";
import { GroupMenu, GroupTitle, NewGroupButton } from "./page-group-controls";
import { verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { PageGroup } from "./page-groups";
import {
  GroupSortable,
  PageGroupsDnd,
  PageList,
  useGroupItem,
  usePageItem,
} from "./page-groups-dnd";
import { SECTION_TONES } from "./section-colors";
import { byTitle, bySectionTitle, membersOf } from "./sections";
import type { CanvasSection, ManifestBoard, PageSummary } from "./types";
import { UpdateNotice } from "./update-notice";
import { usePageGroups } from "./use-page-groups";
import { playHref } from "./use-play-links";
import { readCollapsedSections, writeCollapsedSections } from "./view-storage";

type Point = { x: number; y: number };

const row =
  "block rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";

function BoardRow({
  board,
  pageId,
  selected,
  indent = 0,
  onFocusBoard,
  onMenu,
}: {
  board: ManifestBoard;
  pageId: string;
  /** Levels of sections the board sits in; each indents it by 12 px. */
  indent?: number;
  selected: boolean;
  onFocusBoard: (name: string) => void;
  onMenu: (name: string, point: Point) => void;
}) {
  const scrollIntoView = useCallback(
    (element: HTMLLIElement | null) => {
      if (selected) element?.scrollIntoView({ block: "nearest" });
    },
    [selected],
  );
  return (
    <li
      ref={scrollIntoView}
      aria-current={selected ? "true" : undefined}
      style={{ marginInlineStart: indent * 12 }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(board.name, { x: event.clientX, y: event.clientY });
      }}
      className={`flex items-center gap-1 rounded-lg hover:bg-accent ${selected ? "bg-secondary" : ""}`}
    >
      <button
        type="button"
        onClick={() => onFocusBoard(board.name)}
        className="min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1.5 text-start focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span dir="auto" className="block truncate text-sm text-foreground">
          {board.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {board.name}
        </span>
      </button>
      <Link
        href={playHref(pageId, board.name, "full")}
        aria-label={`Play ${board.title || board.name}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Play className="size-3 fill-current" />
        Play
      </Link>
    </li>
  );
}

function SectionHeader({
  title,
  count,
  color,
  depth,
  collapsed,
  onToggle,
  onSelect,
  onMenu,
}: {
  title: string;
  count: number;
  color: SectionColor;
  depth: number;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onMenu: (point: Point) => void;
}) {
  return (
    <li
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
      className="mt-2 flex items-center gap-1 rounded-lg py-1.5 ps-1 pe-2 hover:bg-accent"
      style={{ marginInlineStart: depth * 12 }}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand section" : "Collapse section"}
        onClick={onToggle}
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn("transition-transform", collapsed && "-rotate-90")}
        />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-start focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden="true"
          data-color={color}
          className="size-2 shrink-0 rounded-full"
          style={{ background: SECTION_TONES[color].dot }}
        />
        <span
          dir="auto"
          className="min-w-0 flex-1 truncate text-[13px] font-semibold"
        >
          {title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </button>
    </li>
  );
}

function PageRow({
  page,
  pageId,
  indent,
  store,
}: {
  page: PageSummary;
  pageId: string;
  indent: number;
  store: ReturnType<typeof usePageGroups>;
}) {
  const item = usePageItem(page.id);
  return (
    <div
      ref={item.setNodeRef}
      style={item.style}
      className="relative"
      {...item.listeners}
    >
      {item.marked ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-ring"
          style={{ marginInlineStart: indent }}
        />
      ) : null}
      <PageMenu
        page={page}
        store={store}
        iconSize={14}
        iconClassName="shrink-0"
        titleClassName="min-w-0 flex-1 truncate"
      >
        {({ icon, title, renaming }) => (
          <div
            style={{ marginInlineStart: indent }}
            className={cn(
              row,
              "relative flex items-center gap-2",
              page.id === pageId && "bg-secondary font-medium",
              item.dragging && "opacity-40",
            )}
          >
            <Link
              href={`/p/${encodeURIComponent(page.id)}`}
              aria-current={page.id === pageId ? "page" : undefined}
              aria-label={page.title}
              draggable={false}
              className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
            />
            <span className="relative inline-flex">{icon}</span>
            <span
              className={cn(
                "pointer-events-none flex min-w-0 flex-1",
                renaming && "pointer-events-auto relative",
              )}
            >
              {title}
            </span>
            <span className="pointer-events-none text-xs text-muted-foreground tabular-nums">
              {formatNumber(page.boardCount, CHROME_FORMAT)}
            </span>
          </div>
        )}
      </PageMenu>
    </div>
  );
}

function PageRows({
  ids,
  group,
  byId,
  pageId,
  indent,
  store,
}: {
  ids: string[];
  group: string | null;
  byId: Map<string, PageSummary>;
  pageId: string;
  indent: number;
  store: ReturnType<typeof usePageGroups>;
}) {
  return (
    <PageList group={group} ids={ids} strategy={verticalListSortingStrategy}>
      {ids.map((id) => {
        const page = byId.get(id);
        return page ? (
          <PageRow
            key={id}
            page={page}
            pageId={pageId}
            indent={indent}
            store={store}
          />
        ) : null;
      })}
    </PageList>
  );
}

function GroupBlock({
  group,
  byId,
  pageId,
  store,
}: {
  group: PageGroup;
  byId: Map<string, PageSummary>;
  pageId: string;
  store: ReturnType<typeof usePageGroups>;
}) {
  const [renaming, setRenaming] = useState(false);
  const item = useGroupItem(group.id, renaming);
  return (
    <div
      ref={item.setNodeRef}
      style={item.style}
      className={cn(item.dragging && "opacity-40")}
    >
      <GroupMenu
        onRename={() => setRenaming(true)}
        onUngroup={() => store.ungroup(group.id)}
      >
        <div
          ref={item.setHeaderRef}
          {...item.listeners}
          className={cn(
            "mt-1 flex items-center gap-1 rounded-lg px-2 py-1",
            !renaming && "cursor-grab",
            item.highlighted && "bg-accent outline-1 outline-dashed outline-ring",
          )}
        >
          <button
            type="button"
            aria-expanded={!group.collapsed}
            aria-label={group.collapsed ? "Expand group" : "Collapse group"}
            onClick={() => store.toggle(group.id)}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={cn(
                "transition-transform",
                group.collapsed && "-rotate-90",
              )}
            />
          </button>
          <GroupTitle
            title={group.title}
            renaming={renaming}
            onRename={(title) => {
              store.rename(group.id, title);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
            className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground"
          />
          <span className="text-xs text-muted-foreground tabular-nums">
            {group.pages.length}
          </span>
        </div>
      </GroupMenu>
      {group.collapsed ? null : (
        <PageRows
          ids={group.pages}
          group={group.id}
          byId={byId}
          pageId={pageId}
          indent={12}
          store={store}
        />
      )}
    </div>
  );
}

function PageNav({ pages, pageId }: { pages: PageSummary[]; pageId: string }) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const store = usePageGroups(pages.map((page) => page.id));
  const { state } = store;

  return (
    <nav
      aria-label="Pages"
      className="flex max-h-64 shrink-0 flex-col overflow-y-auto"
    >
      <div className="flex items-center justify-between ps-0 pe-1">
        <Link href="/" className={`${row} flex-1 text-muted-foreground`}>
          All pages
        </Link>
        <NewGroupButton onAdd={store.add} align="end" />
      </div>
      <PageGroupsDnd store={store}>
        <GroupSortable groups={state.groups.map((group) => group.id)}>
          {state.groups.map((group) => (
            <GroupBlock
              key={group.id}
              group={group}
              byId={byId}
              pageId={pageId}
              store={store}
            />
          ))}
        </GroupSortable>
        <PageRows
          ids={state.loose}
          group={null}
          byId={byId}
          pageId={pageId}
          indent={0}
          store={store}
        />
      </PageGroupsDnd>
    </nav>
  );
}

/** Pages with their board counts, then this page's boards with a search (`/` focuses it). */
export function Sidebar({
  pages,
  pageId,
  boards,
  sections,
  selected,
  searchRef,
  onFocusBoard,
  onSelectBoards,
  onFrameMenu,
  onSectionMenu,
}: {
  pages: PageSummary[];
  pageId: string;
  boards: ManifestBoard[];
  sections: CanvasSection[];
  selected: string[];
  searchRef: Ref<HTMLInputElement>;
  onFocusBoard: (name: string) => void;
  onSelectBoards: (names: string[]) => void;
  onFrameMenu: (name: string, point: Point) => void;
  onSectionMenu: (id: string, point: Point) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    setCollapsed(readCollapsedSections(pageId));
  }, [pageId]);
  const toggleSection = (id: string) => {
    const next = collapsed.includes(id)
      ? collapsed.filter((item) => item !== id)
      : [...collapsed, id];
    setCollapsed(next);
    writeCollapsedSections(pageId, next);
  };
  const needle = query.trim().toLowerCase();
  const shown = boards.filter(
    (board) =>
      needle === "" ||
      board.name.toLowerCase().includes(needle) ||
      board.title.toLowerCase().includes(needle),
  );

  const known = new Set(sections.map((section) => section.id));
  const loose = shown
    .filter((board) => !board.section || !known.has(board.section))
    .sort(byTitle);
  const renderBoard = (board: ManifestBoard, indent: number) => (
    <BoardRow
      key={board.name}
      board={board}
      pageId={pageId}
      selected={selected.includes(board.name)}
      indent={indent}
      onFocusBoard={onFocusBoard}
      onMenu={onFrameMenu}
    />
  );
  // A section, its own boards, then its sub-sections, one level further in. A section with nothing
  // to show under the search is left out.
  const renderSection = (
    section: CanvasSection,
    depth: number,
    path: string[],
  ): ReactNode => {
    if (path.includes(section.id)) return null;
    const own = shown
      .filter((board) => board.section === section.id)
      .sort(byTitle);
    const closed = needle === "" && collapsed.includes(section.id);
    const subtree = membersOf(section.id, shown, sections);
    if (subtree.length === 0) return null;
    return (
      <Fragment key={section.id}>
        <SectionHeader
          title={section.title}
          count={subtree.length}
          color={section.color ?? "gray"}
          depth={depth}
          collapsed={closed}
          onToggle={() => toggleSection(section.id)}
          onSelect={() => onSelectBoards(subtree)}
          onMenu={(point) => onSectionMenu(section.id, point)}
        />
        {closed ? null : own.map((board) => renderBoard(board, depth + 1))}
        {closed
          ? null
          : sections
              .filter((child) => child.parent === section.id)
              .sort(bySectionTitle)
              .map((child) =>
                renderSection(child, depth + 1, [...path, section.id]),
              )}
      </Fragment>
    );
  };
  // A section whose parent is missing is shown at the top level, as a section with no parent.
  const roots = sections
    .filter((section) => !section.parent || !known.has(section.parent))
    .sort(bySectionTitle);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 border-e border-border bg-card p-3">
      <PageNav pages={pages} pageId={pageId} />
      <Input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search boards"
        aria-label="Search boards"
        dir="ltr"
        lang="en"
      />
      <p className="text-xs text-muted-foreground">
        {shown.length} {shown.length === 1 ? "board" : "boards"}
      </p>
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {loose.map((board) => renderBoard(board, 0))}
        {roots.map((section) => renderSection(section, 0, []))}
        {shown.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            No boards match
          </li>
        ) : null}
      </ul>
      <UpdateNotice />
    </aside>
  );
}
