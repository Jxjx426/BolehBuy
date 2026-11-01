import { initializeDashboard } from "./dashboard.js";
import { initializeNavigation } from "./navigation.js";
import { initializeSimulator } from "./simulator.js";
import { loadRecords } from "./storage.js";

const initialState = loadRecords();

initializeNavigation();
initializeDashboard(initialState);
initializeSimulator();
