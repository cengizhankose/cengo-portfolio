// Moved to tests/server/helpers.ts (BE-17); kept as a re-export so existing
// imports of "./fake-queries" / "../api/fake-queries" keep working.
export {
  SAMPLE_POST,
  captureLogs,
  failingQueries,
  fakeQueries,
} from "../helpers";
