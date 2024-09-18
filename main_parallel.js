// Import required modules
let puppeteer = require("puppeteer"); // Puppeteer for web scraping
let jobindexClass = require("./scrapers/jobindexScraper"); // Jobindex scraper class
let careerjetClass = require("./scrapers/careerjetScraper"); // Careerjet scraper class
let csvConverter = require("./data_functions/csvConverter"); // CSV converter module
let uploadCSVToDatabase = require("./data_functions/databaseUploader"); // Database uploader module
const { performance } = require("perf_hooks"); // Performance module for measuring execution time
let browser; // Declare browser globally to reuse across multiple scraping sessions
const path = require("path"); // Path module for handling file paths
const possible_duplicates = require("./data_functions/duplicatesChecker"); // Duplicates checker module
const orm = require("./database/databaseConnector"); // ORM module for database operations

// Add the unhandled rejection listener at the top
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Variables to capture end times for different tasks
let jobEndTime = null;
let careerEndTime = null;
let csvEndTime = null;
let duplicatesEndTime = null;
let totalEndTime = null;
let duplicatesStartTime = null;
let csvStartTime = null;

const DB_CONFIG_NEW = {
  host: "localhost",
  port: process.env.MYSQL_PORT,
  user: "root",
  password: "4b6YA5Uq2zmB%t5u2*e5jT!u4c$lfw6T",
  database: "Merged_Database_Test",
};

/**
 * Main function to orchestrate scraping, CSV conversion, duplicate checking,
 * and database disconnection.
 *
 * This function runs the Jobindex and Careerjet scrapers in parallel, checks for duplicates,
 * and converts the scraped data into a CSV file. It also handles error checking and resource cleanup.
 */
async function main() {
  try {
    // Initialize the Puppeteer browser
    await initBrowser();

    // Start a timer to track the total execution time of the whole process
    const totalStartTime = performance.now();

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

    // Only proceed with CSV conversion and duplicate checking if both scrapers succeeded
    if (
      jobindexResult.status === "fulfilled" &&
      careerjetResult.status === "fulfilled"
    ) {
      await runCSVConversionAndDuplicateCheck(2); // Run CSV conversion and duplicate checking
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
 * Disconnect all active database connections.
 *
 * This ensures that the database connection is properly closed after all tasks are done.
 */
// Assuming you're using a connection pool
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
 * Cleanup resources like browser instances and database connections.
 *
 * This function ensures that both the browser and the database connections are properly cleaned up.
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
 * Log the execution time of each major task (scraping, CSV conversion, duplicate checking).
 *
 * @param {number} totalStartTime - The start time for the entire process.
 */
async function logAllTimings(totalStartTime) {
  console.log(
    "Jobindex scraper execution time: " +
      (jobEndTime - totalStartTime) / 1000 +
      " seconds"
  );
  console.log(
    "Careerjet scraper execution time: " +
      (careerEndTime - totalStartTime) / 1000 +
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

/**
 * Run the CSV conversion and duplicate checking process sequentially.
 *
 * This function is only called after the scrapers have successfully run.
 *
 * @param {number} queryNumber - The query number for the CSV conversion process.
 */
async function runCSVConversionAndDuplicateCheck(queryNumber) {
  // CSV Conversion
  csvStartTime = performance.now();
  await csvConverter.exportToCSV(queryNumber); // Convert scraped data to CSV format
  csvEndTime = performance.now();

  // Duplicates Checker
  duplicatesStartTime = performance.now();
  await possible_duplicates.checkForDuplicates(); // Check for duplicates in the database
  duplicatesEndTime = performance.now();
}

/**
 * Handles and logs errors that occur during the process.
 *
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
 * This function launches the browser in headless mode and sets required configurations.
 * The browser is reused across multiple scraping tasks to optimize resource usage.
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
 * This ensures that all browser resources are cleaned up once scraping tasks are done.
 */
async function closeBrowser() {
  if (browser) {
    console.log("Closing all pages...");
    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));
    console.log("Closing browser...");
    await browser.close();
    browser = null;
    console.log("Browser closed.");
  }
}

/**
 * Scrape job listings from Jobindex using Puppeteer.
 *
 * This function opens a new browser tab and scrapes Jobindex for job postings.
 * The results are then stored in the database.
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
 * Scrape job listings from Careerjet using Puppeteer.
 *
 * This function opens a new browser tab and scrapes Careerjet for job postings.
 * The results are then stored in the database.
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
 * Retry mechanism for operations such as database connections or scraping tasks.
 *
 * This function retries an asynchronous operation a specified number of times using exponential backoff.
 *
 * @param {function} operation - The asynchronous operation to retry.
 * @param {number} retries - The number of retry attempts (default: 3).
 * @param {number} delay - The delay between retries in milliseconds (default: 2000).
 * @returns {Promise<any>} - The result of the operation if successful, or throws an error after exhausting retries.
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
 * This function manages database connections, scraping, and retries for a given scraper.
 *
 * @param {object} scraper - The scraper instance to run.
 * @param {object} page - The Puppeteer page object for the scraper to use.
 * @param {string} scraperName - The name of the scraper (for logging purposes).
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

// Main function execution
main().then(
  () => {
    console.log("Process finished successfully.");
    process.exit(0);
  },
  (error) => {
    console.error("Process finished with errors:", error);
    process.exit(1); // Exit with error code
  }
);

module.exports = { main };