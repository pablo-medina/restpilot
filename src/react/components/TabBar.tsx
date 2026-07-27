import { useRef } from "react";
import { EnvironmentPopover } from "./EnvironmentPopover";
import { environmentChipLabel } from "../../app/environments";
import { useTabReorder } from "../hooks/useTabReorder";
import { getActiveRequest, getRequest, setState, state } from "../../app/state";
import { iconChevronLeft, iconChevronRight } from "../../lib/icons";
import { t } from "../../i18n";
import { toggleRequestPopover } from "../../ui/request-popovers";
import { useRenderGeneration } from "../hooks/useRenderGeneration";
import { closeContextMenuBridge, syncContextMenuBridge } from "../lib/context-menu-bridge";
import { closeRequestTab, openRequestTab } from "../lib/tab-actions";
import { bumpRenderGeneration } from "../render-bridge";
import type { SavedRequest } from "../../types";
import { Icon } from "./Icon";

function toggleRequestActionsMenu(trigger: HTMLElement): void {
  const request = getActiveRequest();
  if (!request) return;

  const actionsOpen =
    state.contextMenu?.kind === "request-actions" && state.contextMenu.requestId === request.id;

  if (actionsOpen) {
    closeContextMenuBridge();
    bumpRenderGeneration();
    return;
  }

  const rect = trigger.getBoundingClientRect();
  setState(prev => ({
    ...prev,
    contextMenu: {
      kind: "request-actions",
      x: rect.right,
      y: rect.bottom + 4,
      requestId: request.id
    }
  }));
  syncContextMenuBridge();
  bumpRenderGeneration();
}

function scrollTabStrip(direction: -1 | 1) {
  const viewport = document.querySelector<HTMLElement>(".title-bar-tabs-host .tab-strip-viewport");
  if (!viewport) return;
  const delta = Math.max(120, viewport.clientWidth * 0.65) * direction;
  viewport.scrollBy({ left: delta, behavior: "smooth" });
}

type Props = {
  refresh: () => void;
  embedded?: boolean;
};

function TabBarTools({ request }: { request: SavedRequest }) {
  const envLabels = t().environments;
  const requestLabels = t().request;
  const envExpanded = state.openRequestPopover === "environment";
  const actionsOpen =
    state.contextMenu?.kind === "request-actions" && state.contextMenu.requestId === request.id;

  const envBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="tab-bar-tools">
      <button
        ref={envBtnRef}
        type="button"
        id="request-env-btn"
        className={`env-chip request-popover-trigger${envExpanded ? " is-active" : ""}`}
        title={envLabels.chipTitle}
        aria-haspopup="dialog"
        aria-expanded={envExpanded}
        onClick={() => { toggleRequestPopover("environment"); bumpRenderGeneration(); }}
      >
        <span className="env-chip-label">{environmentChipLabel()}</span>
        <span className="env-chip-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <button
        type="button"
        id="request-actions-trigger"
        className={`tab-actions-trigger${request.streamResponse ? " has-stream" : ""}`}
        data-request-actions-trigger
        aria-haspopup="menu"
        aria-expanded={actionsOpen}
        title={requestLabels.actions}
        onClick={(event) => toggleRequestActionsMenu(event.currentTarget)}
      >
        <span className="tab-actions-label">{requestLabels.actions}</span>
        <span dangerouslySetInnerHTML={{ __html: iconChevronRight }} />
      </button>
      {envExpanded && <EnvironmentPopover anchor={envBtnRef.current} />}
    </div>
  );
}

function RequestTab({
  requestId,
  active,
  refresh
}: {
  requestId: string;
  active: boolean;
  refresh: () => void;
}) {
  const request = getRequest(requestId);
  if (!request) return null;
  const isPreview = state.previewTabId === requestId;
  return (
    <div
      className={`request-tab${active ? " active" : ""}${isPreview ? " is-preview" : ""}`}
      data-open-tab={requestId}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      onClick={() => openRequestTab(requestId, refresh)}
      onMouseDown={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        closeRequestTab(requestId, refresh);
      }}
    >
      <span className="tab-label">{request.title}</span>
      <button
        className="mini-btn tab-close field-remove-btn"
        data-close-tab={requestId}
        type="button"
        aria-label={t().dialog.close}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          closeRequestTab(requestId, refresh);
        }}
      >
        ×
      </button>
    </div>
  );
}

export function TabBar({ refresh, embedded = false }: Props) {
  useRenderGeneration();
  const stripRef = useRef<HTMLDivElement>(null);
  const request = state.openTabs.includes(state.activeTabId)
    ? getRequest(state.activeTabId)
    : undefined;
  const tab = request ? state.tabs[request.id] : null;

  useTabReorder({ stripRef, refresh });

  if (!state.openTabs.length) return null;

  const labels = t().request;

  const strip = (
    <div className="tab-strip-wrap">
      <button
        className="tab-scroll-btn tab-scroll-back is-hidden"
        type="button"
        aria-label={labels.tabScrollBack}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          scrollTabStrip(-1);
        }}
      >
        <Icon html={iconChevronLeft} />
      </button>
      <div className="tab-strip-viewport">
        <div className="tab-strip" ref={stripRef}>
          {state.openTabs.map((requestId) => (
            <RequestTab
              key={requestId}
              requestId={requestId}
              active={state.activeTabId === requestId}
              refresh={refresh}
            />
          ))}
        </div>
      </div>
      <button
        className="tab-scroll-btn tab-scroll-forward is-hidden"
        type="button"
        aria-label={labels.tabScrollForward}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          scrollTabStrip(1);
        }}
      >
        <Icon html={iconChevronRight} />
      </button>
    </div>
  );

  if (!embedded) return strip;

  return (
    <header className="tab-bar">
      {strip}
      <div className="title-bar-drag" data-tauri-drag-region aria-hidden="true" />
      {request && tab ? <TabBarTools request={request} /> : null}
    </header>
  );
}
