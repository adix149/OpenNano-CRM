import { createApp } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import "./style.css";
import App from "./App.vue";
import router from "./router";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount("#app");
