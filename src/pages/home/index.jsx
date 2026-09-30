import { useState } from "react";
import { preload } from "react-dom";
import "./style.css";
import Typewriter from "typewriter-effect";
import { introdata } from "../../content_option";
import { Link, useLocation } from "react-router-dom";
import photoImg from "../../assets/images/photo.JPG";
import { getPageMeta } from "../../seo/pages.js";
import { matchRoute } from "../../seo/routes.js";
import { usePageMeta } from "../../seo/usePageMeta.js";

export const Home = () => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const route = matchRoute(useLocation().pathname);
  usePageMeta(getPageMeta(route, route.locale));
  // Hero LCP hint (React 19 preload); moves to index.html with PERF-01.
  preload(photoImg, { as: "image", fetchPriority: "high" });

  return (
    <section id="home" className="home">
      <div className="intro_sec d-block d-lg-flex align-items-center ">
        <div className="h_bg-image order-1 order-lg-2 h-100 position-relative">
          {!imageLoaded && <div className="img-placeholder" />}
          <img
            src={photoImg}
            alt="Cengizhan Köse"
            style={{
              opacity: imageLoaded ? 1 : 0,
            }}
            fetchPriority="high"
            loading="eager"
            onLoad={() => setImageLoaded(true)}
          />
        </div>
        <div className="text order-2 order-lg-1 h-100 d-lg-flex justify-content-center">
          <div className="align-self-center ">
            <div className="intro mx-auto">
              <h2 className="mb-1x">{introdata.title}</h2>
              <h1 className="fluidz-48 mb-1x">
                <Typewriter
                  options={{
                    strings: [
                      introdata.animated.first,
                      introdata.animated.second,
                      introdata.animated.third,
                    ],
                    autoStart: true,
                    loop: true,
                    deleteSpeed: 10,
                  }}
                />
              </h1>
              <p className="mb-1x">{introdata.description}</p>
              <div className="intro_btn-action pb-5">
                <Link to="/about" className="text_2">
                  <div id="button_p" className="ac_btn btn ">
                    About Me
                    <div className="ring one"></div>
                    <div className="ring two"></div>
                    <div className="ring three"></div>
                  </div>
                </Link>
                <Link to="/contact">
                  <div id="button_h" className="ac_btn btn">
                    Contact Me
                    <div className="ring one"></div>
                    <div className="ring two"></div>
                    <div className="ring three"></div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
