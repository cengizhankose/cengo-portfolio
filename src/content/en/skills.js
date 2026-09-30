// EN page content, section "skills" (T-12, FE-14). Written in
// W6-MKT-about-positioning (MKT-05 step 3): the five groups of the CV
// (00-icerik-girdileri.md §3.3), no percentages, and only what the CV lists
// (the two tools the old list named are not on it). Technology names are
// identical in every language; descriptive items and group names are
// translated. src/content/tr/skills.js has the same shape, ids and item
// counts.
export default [
  {
    id: "frontend",
    name: "Frontend",
    items: [
      "TypeScript",
      "JavaScript",
      "React",
      "Next.js",
      "CSS/Sass",
      "Redux Toolkit",
      "Zustand",
      "React Query",
      "design systems",
      "accessibility",
    ],
  },
  {
    id: "mobile",
    name: "Mobile",
    items: [
      "React Native",
      "Expo",
      "Expo Router",
      "EAS",
      "offline caching and sync",
    ],
  },
  {
    id: "backend_data",
    name: "Backend and data",
    items: [
      "Node.js",
      "Express.js",
      "NestJS",
      ".NET",
      "REST APIs",
      "PostgreSQL",
      "MongoDB",
      "Redis",
      "Firebase",
      "Supabase",
    ],
  },
  {
    id: "realtime_ai",
    name: "Real-time and AI",
    items: [
      "WebSockets",
      "SignalR",
      "Kafka",
      "MCP",
      "LangChain",
      "Pinecone",
      "LLM integrations and agentic workflows",
    ],
  },
  {
    id: "delivery_quality",
    name: "Delivery and quality",
    items: [
      "Docker",
      "GoCD",
      "GitHub Actions",
      "Vercel",
      "unit, integration and end-to-end testing",
      "OpenTelemetry",
      "Grafana",
    ],
  },
];
