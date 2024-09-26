// const parallel = require("./main_parallel");
// const sequential = require("./main_sequential");
const companyDownloader = require("./data_functions/companyDataDownloader");
const companyData = require("./data_functions/companyDataUploader");

async function main() {
  try {
    console.log("Starting processes");
    const downloaderStart = performance.now();
    console.log("Initiating Company Downloader.\n Expected time to finish = 20 min");
    await companyDownloader.main();
    const downloaderEnd = performance.now();
    // Call the main function from companyData which handles database interactions
    const uploaderStart = performance.now();
    console.log("Initiating Company Uploader.\n Expected time to finish = 10 min");
    await companyData.main();
    const uploaderEnd = performance.now();
    console.log("Data upload completed successfully.");

    console.log(
      "CompanyDataDownloader execution time: " +
        (downloaderEnd - downloaderStart) / 1000 +
        " seconds"
    );
    console.log(
      "CompanyDataUploader execution time: " +
        (uploaderEnd - uploaderStart) / 1000 +
        " seconds"
    );
  } catch (error) {
    console.error("Error during data upload:", error);
    throw error; // Re-throw the error to be caught in the main execution block
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
