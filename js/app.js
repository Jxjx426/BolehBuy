import { initializeDashboard } from "./dashboard.js";
import { initializeNavigation } from "./navigation.js";
import { loadRecords } from "./storage.js";

const initialState = loadRecords();

initializeNavigation();
initializeDashboard(initialState);
