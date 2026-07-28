import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("node/:uuid", "routes/node.tsx"),
] satisfies RouteConfig;
