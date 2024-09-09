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

// Variables to capture end times for different tasks
let jobEndTime = null;
let careerEndTime = null;
let csvEndTime = null;
let duplicatesEndTime = null;
let totalEndTime = null;
let duplicatesStartTime = null;
let csvStartTime = null;

/**
 * Main function to orchestrate the scraping, CSV conversion, duplicate checking, 
 * and database disconnection process.
 */
async function main() {
  try {
    await initBrowser(); // Initialize the Puppeteer browser

    // Start timers to measure the total execution time and individual scraper times
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

    // Log execution times
    await logAllTimings(jobStartTime, careerStartTime, totalStartTime);

    await closeBrowser(); // Close the browser after scraping is complete

    // Properly disconnect the database after everything is done
    await disconnectAllDatabases();
    await cleanup(); // Clean up all resources before exiting

    console.log("All tasks completed successfully. Exiting gracefully.");
  } catch (error) {
    handleErrors(error); // Handle any errors that occur during the process
  }
}

/**
 * Disconnect all databases properly.
 */
async function disconnectAllDatabases() {
  try {
    await orm.disconnectDatabase(); // Disconnect from the database
    console.log("Successfully disconnected from the database.");
  } catch (error) {
    console.error("Error disconnecting from the database:", error);
  }
}

/**
 * Clean up resources by closing the browser and database connections.
 */
async function cleanup() {
  try {
    await closeBrowser(); // Close the Puppeteer browser
    await disconnectAllDatabases(); // Disconnect the database
    console.log("All resources cleaned up successfully.");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
}

/**
 * Logs the execution time of each major task (scraping, CSV conversion, duplicate checking).
 */
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

/**
 * Runs the CSV conversion and duplicate check process sequentially.
 */
async function runCSVConversionAndDuplicateCheck() {
  // CSV Conversion
  csvStartTime = performance.now();
  await csvConverter.exportToCSV(); // Convert the scraped data to CSV format
  csvEndTime = performance.now();

  // Duplicates Checker
  duplicatesStartTime = performance.now();
  await possible_duplicates.checkForDuplicates(); // Check for duplicates in the database
  duplicatesEndTime = performance.now();
}

/**
 * Handles errors that occur during the process.
 */
function handleErrors(error) {
  if (error instanceof AggregateError) {
    console.error("Multiple errors occurred:", error.errors); // Log multiple errors if present
  } else {
    console.error("An error occurred:", error.message, error.stack); // Log a single error
  }
}

/**
 * Retry mechanism to handle intermittent failures in operations.
 * @param {function} operation - The operation to retry.
 * @param {number} retries - The number of retry attempts.
 * @param {number} delay - The delay between retries.
 */
async function retryOperation(operation, retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation(); // Try the operation
    } catch (error) {
      if (attempt === retries) throw error; // Throw error after max retries
      console.log(`Retrying operation... Attempt ${attempt}`);
      await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
      delay = Math.min(delay * 2, 10000); // Increase delay with a cap at 10 seconds
    }
  }
}

/**
 * Initializes the Puppeteer browser instance.
 * Runs in headless mode (no GUI) and sets up security options.
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
    await browser.close(); // Close the browser
    browser = null; // Reset the browser variable to ensure it can be re-initialized
    console.log("Browser closed.");
  }
}

/**
 * Performs web scraping for Jobindex using Puppeteer.
 */
async function jobIndexScraping() {
  const page = await browser.newPage(); // Open a new browser page for Jobindex
  await page.setExtraHTTPHeaders({
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7", // Set HTTP headers for Danish language
  });

  // Check environment variables for the scraping condition
  if (
    !process.env.ADVERTS_SCRAPE ||
    process.env.ADVERTS_SCRAPE === "all" ||
    process.env.ADVERTS_SCRAPE === "jobindex"
  ) {
    let scraper = new jobindexClass(); // Initialize the Jobindex scraper
    await runScraper(scraper, page, "JobIndex"); // Run the scraper with retry logic
    scraper.printDatabaseResult(); // Print the database results
    jobEndTime = performance.now(); // Capture Jobindex scraper end time
  }
}

/**
 * Performs web scraping for Careerjet using Puppeteer.
 */
async function careerjetScraping() {
  const page = await browser.newPage(); // Open a new browser page for Careerjet
  await page.setExtraHTTPHeaders({
    "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7", // Set HTTP headers for Danish language
  });

  // Check environment variables for the scraping condition
  if (
    !process.env.ADVERTS_SCRAPE ||
    process.env.ADVERTS_SCRAPE === "all" ||
    process.env.ADVERTS_SCRAPE === "careerjet"
  ) {
    let scraper = new careerjetClass(); // Initialize the Careerjet scraper
    await runScraper(scraper, page, "CareerJet"); // Run the scraper with retry logic
    scraper.printDatabaseResult(); // Print the database results
    careerEndTime = performance.now(); // Capture Careerjet scraper end time
  }
}

/**
 * Orchestrates the sequence of operations for a scraper process.
 * @param {object} scraper - The scraper instance to run.
 * @param {object} page - The Puppeteer page object for the scraper to use.
 * @param {string} scraperName - The name of the scraper (for logging).
 */
async function runScraper(scraper, page, scraperName) {
  try {
    await retryOperation(() => scraper.connectDatabase()); // Connect to the database with retry
    await retryOperation(() => scraper.initializeDatabase()); // Initialize the database
    await retryOperation(() =>
      scraper.beginScraping(page, browser, 1, 3, scraperName)
    ); // Start the web scraping process
  } catch (error) {
    console.log("Critical error during scraping process: " + error); // Log any critical errors
  } finally {
    if (page) await page.close(); // Ensure the page is closed after scraping
  }
}

// Main function execution
main().then(() => {
    console.log("Process finished successfully.");
    // Let Node.js exit naturally if all resources are cleaned up
  }, (error) => {
    console.error("Process finished with errors:", error);
  });
