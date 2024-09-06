// Import required modules
let puppeteer = require("puppeteer"); // Puppeteer for web scraping
let jobindexClass = require("./scrapers/jobindex-scraper-1.0.0"); // Jobindex scraper class
let careerjetClass = require("./scrapers/careerjet-scraper-1.0.0"); // Careerjet scraper class
let csvConverter = require("./data/CSV_Converter"); // CSV converter module
let uploadCSVToDatabase = require("./data/database_uploader"); // Database uploader module
const { performance } = require("perf_hooks"); // Performance module for measuring execution time
let browser; // Declare browser outside to reuse if needed across multiple scraping sessions
const path = require("path"); // Path module for handling file paths
const possible_duplicates = require("./data/duplicates_Checker"); // Duplicates checker module
const orm = require("../HypeCrawler/data/general-orm-1.0.0"); // ORM module for database operations

let jobEndTime = null;
let careerEndTime = null;
let csvEndTime = null;
let duplicatesEndTime = null;
let totalEndTime = null;
let duplicatesStartTime = null;
let csvStartTime = null;

async function main() {
  try {
    await initBrowser();
    var totalStartTime = performance.now();
    var jobStartTime = performance.now();
    var careerStartTime = performance.now();

    // Start Jobindex and Careerjet scrapers in parallel
    const jobindexPromise = jobIndexScraping();
    const careerjetPromise = careerjetScraping();

    // Wait for both scrapers to complete
    await Promise.all([jobindexPromise, careerjetPromise]);

    // Run CSV conversion and duplicates checker after scraping
    await runCSVConversionAndDuplicateCheck();
    totalEndTime = performance.now();
    // Log timings (moved after both scrapers and other tasks finish)
    await logAllTimings(jobStartTime, careerStartTime, totalStartTime);

    await closeBrowser(); // Close browser after everything is done

    // Properly disconnect the database
    await disconnectAllDatabases();
    // Ensure all resources are cleaned up before exiting
    await cleanup();

    console.log("All tasks completed successfully. Exiting gracefully.");
  } catch (error) {
    handleErrors(error);
  }
}

/**
 * Disconnect all databases properly.
 */

async function disconnectAllDatabases() {
  try {
    // Assuming both scrapers are using the same ORM class
    await orm.disconnectDatabase();
    console.log("Successfully disconnected from the database.");
  } catch (error) {
    console.error("Error disconnecting from the database:", error);
  }
}

async function cleanup() {
  try {
    // Close Puppeteer browser
    await closeBrowser();

    // Close database connection
    await disconnectAllDatabases();

    // Log success message
    console.log("All resources cleaned up successfully.");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

async function logAllTimings(jobStartTime, careerStartTime, totalStartTime) {
  console.log(
    "Jobindex scraper execution time: " +
      (jobEndTime - jobStartTime) / 1000 +
      " seconds"
  );
  console.log(
    "Careerjet scraper execution time: " +
      (careerEndTime - careerStartTime) / 1000 +
      " seconds"
  );
  console.log(
    "CSV converter execution time: " +
      (csvEndTime - csvStartTime) / 1000 +
      " seconds"
  );
  console.log(
    "Duplicates checker execution time: " +
      (duplicatesEndTime - duplicatesStartTime) / 1000 +
      " seconds"
  );
  console.log(
    "Total Execute time: " + (totalEndTime - totalStartTime) / 1000 + " seconds"
  );
}

async function runCSVConversionAndDuplicateCheck() {
  // CSV Conversion
  csvStartTime = performance.now();
  await csvConverter.exportToCSV();
  csvEndTime = performance.now();

  // Duplicates Checker
  duplicatesStartTime = performance.now();
  await possible_duplicates.checkForDuplicates();
  duplicatesEndTime = performance.now();
}

function handleErrors(error) {
  if (error instanceof AggregateError) {
    console.error("Multiple errors occurred:", error.errors);
  } else {
    console.error("An error occurred:", error.message, error.stack);
  }
}

async function retryOperation(operation, retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === retries) throw error;
      console.log(`Retrying operation... Attempt ${attempt}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 10000); // Cap the delay at 10 seconds
    }
  }
}

/**
 * Initializes the Puppeteer browser instance.
 */
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true, // Run in headless mode without a GUI.
      defaultViewport: null, // Use the default viewport size.
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Security arguments for running in certain environments.
      protocolTimeout: 600000, // Set a long timeout to avoid premature disconnections.
    });
  }
}

/**
 * Closes the Puppeteer browser instance.
 */
async function closeBrowser() {
  if (browser) {
    console.log("Closing browser...");
    await browser.close();
    browser = null; // Reset the browser variable
    console.log("Browser closed.");
  }
}

/**
 * Asynchronously performs web scraping for Jobindex using Puppeteer.
 */
async function jobIndexScraping() {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7",
  });

  if (
    !process.env.ADVERTS_SCRAPE ||
    process.env.ADVERTS_SCRAPE === "all" ||
    process.env.ADVERTS_SCRAPE === "jobindex"
  ) {
    let scraper = new jobindexClass();
    await runScraper(scraper, page, "JobIndex");
    scraper.printDatabaseResult();
    jobEndTime = performance.now(); // Capture Jobindex end time when scraping is done
  }
}

/**
 * Asynchronously performs web scraping for Careerjet using Puppeteer.
 */
async function careerjetScraping() {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7",
  });

  if (
    !process.env.ADVERTS_SCRAPE ||
    process.env.ADVERTS_SCRAPE === "all" ||
    process.env.ADVERTS_SCRAPE === "careerjet"
  ) {
    let scraper = new careerjetClass();
    await runScraper(scraper, page, "CareerJet");
    scraper.printDatabaseResult();
    careerEndTime = performance.now(); // Capture Careerjet end time when scraping is done
  }
}

/**
 * Orchestrates the sequence of operations for the scraper process.
 */
async function runScraper(scraper, page, scraperName) {
  try {
    await retryOperation(() => scraper.connectDatabase()); // Connect to the database
    await retryOperation(() => scraper.initializeDatabase()); // Initialize the database
    await retryOperation(() =>
      scraper.beginScraping(page, browser, 1, 3, scraperName)
    ); // Start scraping
  } catch (error) {
    console.log("Critical error during scraping process: " + error);
  } finally {
    if (page) await page.close(); // Ensure pages are closed
  }
}

main().then(() => {
    console.log("Process finished successfully.");
    // Do not force exit here, let Node.js exit naturally if all resources are cleaned up
  }, (error) => {
    console.error("Process finished with errors:", error);
  });
