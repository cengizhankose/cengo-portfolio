// Lightweight stand-ins for the real pages. The nav/landmark tests exercise
// the shell (header, <main>, transitions, focus), not page content, so the
// pages are replaced with a heading plus one focusable control each. That
// also keeps these tests independent of page-level work in other packages
// (head module, blog data layer, hero).
function stubPage(name) {
  const Page = () => (
    <>
      <h1>{name}</h1>
      <a href={`#${name.toLowerCase().replace(/\s+/g, "-")}-details`}>
        {name} details
      </a>
    </>
  );
  Page.displayName = name.replace(/\s+/g, "");
  return Page;
}

export const Home = stubPage("Home page");
export const About = stubPage("About page");
export const Portfolio = stubPage("Portfolio page");
export const ContactUs = stubPage("Contact page");
export const BlogHome = stubPage("Blog page");
export const BlogPost = stubPage("Post page");
