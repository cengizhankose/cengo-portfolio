// Click tracking of the portfolio's project links (ANL-11): one
// `project_clicked { project_id, link_type, position }` per click, and no
// `outbound_link_clicked` for the same click (data-track="project" is the
// exclusion the delegated outbound listener honours, ANL-09).
//
// `position` is the 1-based place of the link's project among the items the
// page shows, in page order: the cases first, then the hackathon archive,
// then the selected repos. A middle click opens the link in a new tab without
// a click event, so auxclick is counted too.
import { track } from "../../lib/analytics/index.js";

export const PROJECT_TRACK = "project";

/** Props for a link that belongs to a project (spread onto <a> / <Link>). */
export function projectLinkProps(projectId, linkType, position) {
  const send = () =>
    track("project_clicked", {
      project_id: projectId,
      link_type: linkType,
      position,
    });
  return {
    "data-track": PROJECT_TRACK,
    onClick: send,
    onAuxClick: (event) => {
      if (event.button === 1) send();
    },
  };
}
