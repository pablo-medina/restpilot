import { Fragment } from "react";
import { collectionAncestorFolders } from "../../app/collection-breadcrumb";
import { t } from "../../i18n";
import { iconChevronRight, iconCollection } from "../../lib/icons";
import { revealCollectionRoot, revealTreeItem } from "../lib/collection-tree-actions";
import { Icon } from "./Icon";
import type { SavedRequest } from "../../types";

type Props = {
  request: SavedRequest;
  refresh: () => void;
};

/** Folders shown in full before the middle of the path collapses to an ellipsis crumb. */
const MAX_FOLDER_CRUMBS = 4;

function Separator() {
  return <Icon className="request-breadcrumb-sep" html={iconChevronRight} />;
}

/**
 * The collection path of the open request, on its own row above the URL line. Every crumb
 * reveals its item in the sidebar tree; none of them opens or changes a tab.
 */
export function RequestBreadcrumb({ request, refresh }: Props) {
  const labels = t().request.breadcrumb;
  const folders = collectionAncestorFolders(request.parentId);

  // Deep paths keep the outermost folder and the two nearest ones; `null` is the ellipsis.
  const collapsed = folders.length > MAX_FOLDER_CRUMBS;
  const crumbs = collapsed ? [folders[0], null, ...folders.slice(-2)] : folders;
  const hidden = collapsed ? folders.slice(1, -2) : [];

  return (
    <nav className="request-breadcrumb" aria-label={labels.location}>
      <button
        type="button"
        className="request-breadcrumb-crumb request-breadcrumb-crumb--root"
        title={labels.root}
        onClick={() => revealCollectionRoot(refresh)}
      >
        <Icon className="request-breadcrumb-icon" html={iconCollection} />
        <span className="request-breadcrumb-label">{labels.root}</span>
      </button>

      {crumbs.map((folder, index) => (
        <Fragment key={folder ? folder.id : `gap-${index}`}>
          <Separator />
          {folder ? (
            <button
              type="button"
              className="request-breadcrumb-crumb"
              title={folder.title}
              aria-label={labels.reveal.replace("{name}", folder.title)}
              onClick={() => revealTreeItem(folder.id, refresh)}
            >
              <span className="request-breadcrumb-label">{folder.title}</span>
            </button>
          ) : (
            <span
              className="request-breadcrumb-crumb request-breadcrumb-gap"
              title={hidden.map((item) => item.title).join(" / ")}
              aria-label={labels.moreFolders.replace("{count}", String(hidden.length))}
            >
              …
            </span>
          )}
        </Fragment>
      ))}

      <Separator />
      <button
        type="button"
        className="request-breadcrumb-crumb request-breadcrumb-crumb--current"
        aria-current="page"
        title={request.title}
        aria-label={labels.reveal.replace("{name}", request.title)}
        onClick={() => revealTreeItem(request.id, refresh)}
      >
        <span className="request-breadcrumb-label">{request.title}</span>
      </button>
    </nav>
  );
}
