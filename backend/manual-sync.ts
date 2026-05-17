
import dotenv from 'dotenv';
dotenv.config();

// Simple console logger
console.log("Initializing Manual Sync...");

import * as scheduler from './src/utils/vmLavScheduler';

async function run() {
    console.log("Starting manual synchronization for User ID 1...");
    try {
        await scheduler.sincronizarUsuario(1);
        console.log("Synchronization finished.");
    } catch (error) {
        console.error("Sync failed:", error);
    }
    process.exit(0);
}

run();
