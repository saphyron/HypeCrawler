/**
 * @file main_parallel.js
 * @description Orchestrates the scraping of job listings from multiple sources in parallel,
 * converts data to CSV, checks for duplicates, updates the binding table, and handles database disconnection.
 * It uses Puppeteer for web scraping and manages execution timing for performance tracking.
 */

// Import required modules
const puppeteer = require("puppeteer"); // Puppeteer for web scraping
const jobindexClass = require("./scrapers/jobindexScraper"); // Jobindex scraper class
const careerjetClass = require("./scrapers/careerjetScraper"); // Careerjet scraper class
const csvConverter = require("./data_functions/csvConverter"); // CSV converter module
const { performance } = require("perf_hooks"); // Performance module for measuring execution time
const possible_duplicates = require("./data_functions/duplicatesChecker"); // Duplicates checker module
const orm = require("./database/databaseConnector"); // ORM module for database operations
const bindingTableUpdater = require("./data_functions/bindingTableUpdater"); // Binding table updater module
const archieveScraperClass = require("./utils/jobindexArchiveScraper"); // Archive scraper class

// Global variables
let browser; // Declare browser globally to reuse across multiple scraping sessions

// Variables to capture end times for different tasks
let jobEndTime = null;
let careerEndTime = null;
let csvEndTime = null;
let duplicatesEndTime = null;
let totalEndTime = null;
let duplicatesStartTime = null;
let csvStartTime = null;
let bindingUpdateEndTime = null;
let bindingUpdateStartTime = null;

// Database configuration
const DB_CONFIG_NEW = {
  host: "localhost",
  port: process.env.MYSQL_PORT,
  user: "root",
  password: "4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T", // Consider moving sensitive data to environment variables
  database: "Merged_Database_Test",
};

// Add the unhandled rejection listener at the top
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

/**
 * Main function to orchestrate scraping, data processing, and resource cleanup.
 *
 * @async
 * @function main_parallel
 * @returns {Promise<void>}
 */
async function main_parallel() {
  try {
    // Initialize the Puppeteer browser
    await initBrowser();

    // Start a timer to track the total execution time of the whole process
    const totalStartTime = performance.now();

    // Uncomment scraper below if you have need of custom archive scraping.
    // await archieveScraper();

    // Run both scrapers (Jobindex and Careerjet) in parallel
    const [jobindexResult, careerjetResult] = await Promise.allSettled([
      jobIndexScraping(),
      careerjetScraping(),
    ]);

    // Check if either of the scrapers failed and log the errors
    if (jobindexResult.status === "rejected") {
      console.error("Jobindex scraper failed:", jobindexResult.reason);
    }
    if (careerjetResult.status === "rejected") {
      console.error("Careerjet scraper failed:", careerjetResult.reason);
    }

    // Only proceed with data functions if both scrapers succeeded
    if (
      jobindexResult.status === "fulfilled" &&
      careerjetResult.status === "fulfilled"
    ) {
      await runDataFunctions(2); // Run CSV conversion, duplicate checking, and binding table update
      totalEndTime = performance.now(); // Mark the end time of the total process

      // Log the execution times of all major tasks
      await logAllTimings(totalStartTime);
    } else {
      console.log(
        "One or more scrapers failed. Skipping CSV conversion and duplicates check."
      );
    }
  } catch (error) {
    handleErrors(error); // Handle errors during the entire process
  } finally {
    await cleanup(); // Cleanup any remaining resources
  }
}

/**
 * Disconnects all active database connections.
 *
 * @async
 * @function disconnectAllDatabases
 * @returns {Promise<void>}
 */
async function disconnectAllDatabases() {
  try {
    await orm.disconnectDatabase(); // Disconnect from the database using ORM
    if (orm.pool) {
      await orm.pool.end(); // End the connection pool if applicable
    }
    console.log("Successfully disconnected from the database.");
  } catch (error) {
    console.error("Error disconnecting from the database:", error);
  }
}

/**
 * Cleans up resources like browser instances and database connections.
 *
 * @async
 * @function cleanup
 * @returns {Promise<void>}
 */
async function cleanup() {
  try {
    await closeBrowser(); // Close the Puppeteer browser
    await disconnectAllDatabases(); // Disconnect from the database
    console.log("All resources cleaned up successfully.");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

/**
 * Logs the execution time of each major task.
 *
 * @async
 * @function logAllTimings
 * @param {number} totalStartTime - The start time for the entire process.
 * @returns {Promise<void>}
 */
async function logAllTimings(totalStartTime) {
  console.log(
    "Jobindex scraper execution time: " +
      ((jobEndTime - totalStartTime) / 1000).toFixed(2) +
      " seconds"
  );
  console.log(
    "Careerjet scraper execution time: " +
      ((careerEndTime - totalStartTime) / 1000).toFixed(2) +
      " seconds"
  );
  console.log(
    "CSV converter execution time: " +
      ((csvEndTime - csvStartTime) / 1000).toFixed(2) +
      " seconds"
  );
  console.log(
    "Duplicates checker execution time: " +
      ((duplicatesEndTime - duplicatesStartTime) / 1000).toFixed(2) +
      " seconds"
  );
  console.log(
    "Binding Updater/Inserter's execution time: " +
      ((bindingUpdateEndTime - bindingUpdateStartTime) / 1000).toFixed(2) +
      " seconds"
  );
  console.log(
    "Total execution time: " +
      ((totalEndTime - totalStartTime) / 1000).toFixed(2) +
      " seconds"
  );
}

/**
 * Runs the CSV conversion, duplicate checking, and binding table update processes sequentially.
 *
 * @async
 * @function runDataFunctions
 * @param {number} queryNumber - The query number for the CSV conversion process.
 * @returns {Promise<void>}
 */
async function runDataFunctions(queryNumber) {
  // CSV Conversion
  csvStartTime = performance.now();
  await csvConverter.exportToCSV(queryNumber); // Convert scraped data to CSV format
  csvEndTime = performance.now();

  // Duplicates Checker
  duplicatesStartTime = performance.now();
  await possible_duplicates.checkForDuplicates(); // Check for duplicates in the database
  duplicatesEndTime = performance.now();

  // Binding Table Updater
  bindingUpdateStartTime = performance.now();
  try {
    await bindingTableUpdater.updateBindingTable(); // Update the binding table
  } catch (error) {
    console.error("Binding table updater failed, proceeding with other tasks.");
  }
  bindingUpdateEndTime = performance.now();
}

/**
 * Handles and logs errors that occur during the process.
 *
 * @function handleErrors
 * @param {Error} error - The error object to handle.
 */
function handleErrors(error) {
  if (error instanceof AggregateError) {
    console.error("Multiple errors occurred:", error.errors); // Log multiple errors if available
  } else {
    console.error("An error occurred:", error.message, error.stack); // Log a single error
  }
}

/**
 * Initializes a Puppeteer browser instance.
 *
 * @async
 * @function initBrowser
 * @returns {Promise<void>}
 */
async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true, // Run in headless mode (no browser GUI)
      defaultViewport: null, // Use the default viewport size
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Security settings for Puppeteer
      protocolTimeout: 600000, // Set a long timeout to avoid premature disconnections
    });
  }
}

/**
 * Closes the Puppeteer browser instance.
 *
 * @async
 * @function closeBrowser
 * @returns {Promise<void>}
 */
async function closeBrowser() {
  if (browser) {
    console.log("Closing all pages...");
    const pages = await browser.pages();
    await Promise.all(
      pages.map((page) =>
        page
          .close()
          .catch((err) => console.log(`Error closing page: ${err.message}`))
      )
    );
    console.log("Closing browser...");
    await browser.close();
    browser = null;
    console.log("Browser closed.");
  }
}

/**
 * Scrapes job listings from Jobindex.
 *
 * @async
 * @function jobIndexScraping
 * @returns {Promise<void>}
 */
async function jobIndexScraping() {
  const page = await browser.newPage(); // Open a new browser page for Jobindex
  await page.setExtraHTTPHeaders({
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7", // Set HTTP headers for Danish language
  });

  try {
    let scraper = new jobindexClass(); // Create a new instance of the Jobindex scraper class
    await runScraper(scraper, page, "JobIndex"); // Run the scraper with database connection and retry logic
    scraper.printDatabaseResult(); // Print the scraper results to the database
    jobEndTime = performance.now(); // Capture Jobindex scraper end time
  } catch (error) {
    console.error("Jobindex scraping failed:", error); // Log any errors during the Jobindex scraping process
  } finally {
    await page.close(); // Ensure the page is closed after scraping
  }
}

/**
 * Scrapes job listings from Jobindex Archive.
 *
 * @async
 * @function archieveScraper
 * @returns {Promise<void>}
 */
async function archieveScraper() {
  const page = await browser.newPage(); // Open a new browser page for Jobindex Archive
  await page.setExtraHTTPHeaders({
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7", // Set HTTP headers for Danish language
  });

  try {
    let scraper = new archieveScraperClass(); // Create a new instance of the archive scraper class
    await runScraper(scraper, page, "JobIndex Archive"); // Run the scraper with database connection and retry logic
    scraper.printDatabaseResult(); // Print the scraper results to the database
  } catch (error) {
    console.error("Jobindex archive scraping failed:", error); // Log any errors during the archive scraping process
  } finally {
    await page.close(); // Ensure the page is closed after scraping
  }
}

/**
 * Scrapes job listings from Careerjet.
 *
 * @async
 * @function careerjetScraping
 * @returns {Promise<void>}
 */
async function careerjetScraping() {
  const page = await browser.newPage(); // Open a new browser page for Careerjet
  await page.setExtraHTTPHeaders({
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7", // Set HTTP headers for Danish language
  });

  try {
    let scraper = new careerjetClass(); // Create a new instance of the Careerjet scraper class
    await runScraper(scraper, page, "CareerJet"); // Run the scraper with database connection and retry logic
    scraper.printDatabaseResult(); // Print the scraper results to the database
    careerEndTime = performance.now(); // Capture Careerjet scraper end time
  } catch (error) {
    console.error("Careerjet scraping failed:", error); // Log any errors during the Careerjet scraping process
  } finally {
    await page.close(); // Ensure the page is closed after scraping
  }
}

/**
 * Retries an asynchronous operation with exponential backoff.
 *
 * @async
 * @function retryOperation
 * @param {Function} operation - The asynchronous operation to retry.
 * @param {number} [retries=3] - The number of retry attempts.
 * @param {number} [delay=2000] - The initial delay between retries in milliseconds.
 * @returns {Promise<any>}
 * @throws Will throw an error if all retry attempts fail.
 */
async function retryOperation(operation, retries = 3, delay = 2000) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await operation(); // Attempt to perform the operation
    } catch (error) {
      attempt++;
      if (attempt === retries) throw error; // If max retries reached, throw the error
      console.log(`Retrying operation... Attempt ${attempt} of ${retries}`);
      await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
      delay *= 2; // Exponential backoff: increase the delay on each retry
    }
  }
}

/**
 * Orchestrates the sequence of operations for a scraper process.
 *
 * @async
 * @function runScraper
 * @param {object} scraper - The scraper instance to run.
 * @param {object} page - The Puppeteer page object for the scraper to use.
 * @param {string} scraperName - The name of the scraper.
 * @returns {Promise<void>}
 */
async function runScraper(scraper, page, scraperName) {
  try {
    await retryOperation(() => scraper.connectDatabase()); // Connect to the database with retry logic
    await retryOperation(() => scraper.initializeDatabase()); // Initialize the database
    await retryOperation(() =>
      scraper.beginScraping(page, browser, 1, 3, scraperName)
    ); // Begin the scraping process
  } catch (error) {
    console.log("Critical error during scraping process: " + error); // Log critical errors
  }
}

// Export the main_parallel function
module.exports = { main_parallel };
