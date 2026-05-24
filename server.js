import "dotenv/config";
import app from "./src/app.js";
import { AppDataSource } from "./src/config/database.js";
import { startSummaryJob } from "./src/cron/summaryJob.js";
import { startScraperJob } from "./src/cron/scraperJob.js";
import { startCleanupJob } from "./src/cron/cleanupJob.js";
import { startDailyStatusJob } from "./src/cron/dailyStatusJob.js";
import { startReadAndSendJob } from "./src/cron/readAndSendJob.js";

const PORT = process.env.PORT || 3002;

AppDataSource.initialize()
  .then(() => {
    console.log("Database connected");

    // Start cron jobs only after DB is ready
    startSummaryJob();
    startScraperJob();
    startCleanupJob();
    startDailyStatusJob();
    startReadAndSendJob();

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
    process.exit(1);
  });
