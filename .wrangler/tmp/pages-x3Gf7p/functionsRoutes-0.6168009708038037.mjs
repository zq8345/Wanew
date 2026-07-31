import { onRequest as __es_products___path___js_onRequest } from "C:\\开发\\wanew\\functions\\es\\products\\[[path]].js"
import { onRequest as __pt_products___path___js_onRequest } from "C:\\开发\\wanew\\functions\\pt\\products\\[[path]].js"
import { onRequest as __admin_worker___path___js_onRequest } from "C:\\开发\\wanew\\functions\\admin-worker\\[[path]].js"
import { onRequest as __products___path___js_onRequest } from "C:\\开发\\wanew\\functions\\products\\[[path]].js"
import { onRequest as __scripts___path___js_onRequest } from "C:\\开发\\wanew\\functions\\scripts\\[[path]].js"

export const routes = [
    {
      routePath: "/es/products/:path*",
      mountPath: "/es/products",
      method: "",
      middlewares: [],
      modules: [__es_products___path___js_onRequest],
    },
  {
      routePath: "/pt/products/:path*",
      mountPath: "/pt/products",
      method: "",
      middlewares: [],
      modules: [__pt_products___path___js_onRequest],
    },
  {
      routePath: "/admin-worker/:path*",
      mountPath: "/admin-worker",
      method: "",
      middlewares: [],
      modules: [__admin_worker___path___js_onRequest],
    },
  {
      routePath: "/products/:path*",
      mountPath: "/products",
      method: "",
      middlewares: [],
      modules: [__products___path___js_onRequest],
    },
  {
      routePath: "/scripts/:path*",
      mountPath: "/scripts",
      method: "",
      middlewares: [],
      modules: [__scripts___path___js_onRequest],
    },
  ]