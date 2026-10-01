// EN page content, section "cv" (T-12, FE-14; ANL-12, K-12). The two public CV
// files (no phone number, no home address; 00-icerik-girdileri.md §7) are
// supplied by the owner and live in public/cv/. src/content/tr/cv.js has the
// same list.
//
//   links[]   language   'en' | 'tr' (CV_LANGUAGES in
//                        src/lib/analytics/events.js): the language of the PDF
//             href       the site path of the file (public/cv/ is served at
//                        /cv/)
//             available  false until the file is in public/cv/. A link whose
//                        file is not there is never drawn (a 404 on a download
//                        is worse than no link): <CvLinks /> renders nothing
//                        while no entry is available.
// To publish a CV: put the PDF in public/cv/, set `available: true` here and
// in src/content/tr/cv.js. tests/frontend/home-sections/cv-files.test.js fails
// when a flag and its file disagree.
export default {
  links: [
    { language: "en", href: "/cv/cengizhan-kose-cv-en.pdf", available: false },
    { language: "tr", href: "/cv/cengizhan-kose-cv-tr.pdf", available: false },
  ],
};
