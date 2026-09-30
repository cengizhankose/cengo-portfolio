import "./style.css";
import { socialprofils } from "../../content_option";
import { getSocialLinks } from "./icons";

// Icon-only profile links (FE-02): each link is named by its channel label,
// the icon itself is decorative.
export const Socialicons = () => {
  const links = getSocialLinks(socialprofils);

  return (
    <div className="stick_follow_icon">
      <ul>
        {links.map(({ id, label, url, Icon }) => (
          <li key={id}>
            <a href={url} aria-label={label}>
              <Icon aria-hidden="true" focusable="false" />
            </a>
          </li>
        ))}
      </ul>
      <p>Follow Me</p>
    </div>
  );
};
