const axios = require("axios");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises"); // Import fs/promises
const crypto = require("crypto"); // For generating checksums
const cliProgress = require("cli-progress");
const orm = require("../database/databaseConnector");

// Define the directory path for JSON files
const dirPath = path.join("E:", "Data", "JSON Files", "CompanyData");

// Banned words list
const bannedWords = [
  "Ophørt",
  "Opløst efter erklæring",
  "Opløst efter frivillig likvidation",
  "Opløst efter fusion",
  "Opløst efter grænseskridende fusion",
  "Opløst efter grænseskridende hjemstedsflytning",
  "Opløst efter grænseskridende spaltning",
  "Opløst efter konkurs",
  "Opløst efter spaltning",
  "Slettet",
  "Tvangsopløst",
  "Konkurs",
].map((word) => word.toUpperCase()); // Convert to uppercase

// Helper function to generate a checksum for an object
function generateChecksum(obj) {
  return crypto.createHash("md5").update(JSON.stringify(obj)).digest("hex");
}

// Helper function to find the next available batch number
function getNextBatchNumber() {
  const files = fs.readdirSync(dirPath);
  const batchNumbers = files
    .filter((file) => path.extname(file) === ".json")
    .map((file) => parseInt(path.basename(file, ".json").split("_").pop(), 10))
    .filter((num) => !isNaN(num));

  return batchNumbers.length > 0 ? Math.max(...batchNumbers) + 1 : 0;
}

// Function to cache old data
async function cacheOldData(multiBar) {
  const files = (await fsPromises.readdir(dirPath)).filter(
    (file) => path.extname(file) === ".json"
  );
  const checksums = new Set();

  // Create a progress bar for caching
  const progressBar = multiBar.create(files.length, 0, {
    name: "Caching old data",
    message: "",
  });

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const data = JSON.parse(await fsPromises.readFile(filePath, "utf8"));
    data.forEach((item) => checksums.add(generateChecksum(item)));
    progressBar.increment();
  }

  progressBar.stop();
  return checksums;
}

// Function to check if any banned word is found in 'Vrvirksomhed.sammensatStatus' or 'Vrvirksomhed.virksomhedsstatus'
function containsBannedStatus(sammensatStatus, virksomhedsstatus) {
  // Helper to check if any banned word is present in a given status string
  const hasBannedWord = (status) => {
    return bannedWords.some((bannedWord) => {
      const regex = new RegExp(`\\b${bannedWord}\\b`, "i"); // Use word boundaries to ensure exact match
      return regex.test(status);
    });
  };

  // Check 'Vrvirksomhed.sammensatStatus'
  if (sammensatStatus) {
    // Ensure case-insensitive match and handle concatenated statuses by introducing spaces
    const status = sammensatStatus.replace(/([A-Z])/g, " $1").toUpperCase();
    if (hasBannedWord(status)) {
      return true; // A banned word was found in 'sammensatStatus'
    }
  }

  // Check 'Vrvirksomhed.virksomhedsstatus'
  if (Array.isArray(virksomhedsstatus)) {
    for (let status of virksomhedsstatus) {
      const currentStatus = status.status.toUpperCase();
      if (bannedWords.includes(currentStatus)) {
        return true; // Found a banned status
      }
    }
  }

  return false; // No banned words were found in either field
}

// Function to fetch and process data in batches
async function fetchAndProcessData(oldDataChecksums, multiBar) {
  const totalRecordsEstimate = 2200000; // 2.2 million records estimate
  let recordsProcessed = 0;

  // Create a progress bar for downloading
  const progressBar = multiBar.create(totalRecordsEstimate, 0, {
    name: "Processing new data",
    message: "",
  });

  // Load credentials from configCompany.json
  const configPath = path.join(__dirname, "../configCompany.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const auth = Buffer.from(`${config.username}:${config.password}`).toString(
    "base64"
  );

  const scrollTime = "1m"; // Scroll timeout
  const batchSize = 3000; // Size of each batch
  const initialSearchUrl = `http://distribution.virk.dk/cvr-permanent/virksomhed/_search?scroll=${scrollTime}`;
  const scrollUrl = "http://distribution.virk.dk/_search/scroll";

  let scrollId = null;
  let hasMoreData = true;
  let batchNumber = getNextBatchNumber(); // Determine the next batch number

  while (hasMoreData) {
    let response;
    try {
      if (scrollId) {
        response = await axios.post(
          scrollUrl,
          {
            scroll: scrollTime,
            scroll_id: scrollId,
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        response = await axios.post(
          initialSearchUrl,
          {
            size: batchSize,
            _source: [
              "Vrvirksomhed.cvrNummer",
              "Vrvirksomhed.regnummer",
              "Vrvirksomhed.sidstOpdateret",
              "Vrvirksomhed.navne",
              "Vrvirksomhed.beliggenhedsadresse",
              "Vrvirksomhed.virksomhedsform",
              "Vrvirksomhed.livsforloeb",
              "Vrvirksomhed.status",
              "Vrvirksomhed.virksomhedMetadata",
              "Vrvirksomhed.stiftelsesDato",
              "Vrvirksomhed.virkningsDato",
              "Vrvirksomhed.sammensatStatus",
              "Vrvirksomhed.virksomhedsstatus",
            ],
            query: {
              bool: {
                must: [{ match_all: {} }],
              },
            },
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
          }
        );
        scrollId = response.data._scroll_id;
      }

      const { hits } = response.data;

      if (hits && hits.hits.length > 0) {
        const batch = hits.hits;
        recordsProcessed += batch.length;

        progressBar.increment(batch.length);

        await compareAndSaveData(batch, oldDataChecksums, progressBar); // Compare and save the batch

        if (hits.hits.length < batchSize) {
          hasMoreData = false;
        }
      } else {
        hasMoreData = false;
      }
    } catch (error) {
      console.error(
        "Error fetching data from API:",
        error.response ? error.response.data : error.message
      );
      hasMoreData = false;
    }
  }

  progressBar.stop();
}

// Function to compare fetched data with old data and save new items
async function compareAndSaveData(batch, oldDataChecksums, progressBar) {
  const newDataFound = [];

  for (const item of batch) {
    const itemChecksum = generateChecksum(item);

    // Extract 'sammensatStatus' and 'virksomhedsstatus' from item
    const sammensatStatus =
      item._source?.Vrvirksomhed?.virksomhedMetadata?.sammensatStatus;
    const virksomhedsstatus = item._source?.Vrvirksomhed?.virksomhedsstatus;

    // Skip items that contain banned statuses in either 'sammensatStatus' or 'virksomhedsstatus'
    if (containsBannedStatus(sammensatStatus, virksomhedsstatus)) {
      continue; // Skip this item if it contains any banned word in the status
    }

    if (!oldDataChecksums.has(itemChecksum)) {
      newDataFound.push(item); // Add new item to newDataFound
    }
  }

  if (newDataFound.length > 0) {
    await saveDataToFile(newDataFound); // Save the new items to file

    // Update the progress bar's message
    progressBar.update(progressBar.value, {
      message: `Found ${newDataFound.length} new items.`,
    });

    // Optionally, clear the message after a delay
    setTimeout(() => {
      progressBar.update(progressBar.value, { message: "" });
    }, 5000); // Clear message after 5 seconds
  }
}

// Function to save data to a file
async function saveDataToFile(data) {
  const batchNumber = getNextBatchNumber();
  const filePath = path.join(dirPath, `companyData_batch_${batchNumber}.json`);
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2));
  // Removed console.log to prevent interference with the progress bar
}

// Function to merge and reorganize files in a memory-efficient way
async function mergeAndReorganizeFiles(multiBar) {
  const files = (await fsPromises.readdir(dirPath)).filter(
    (file) => path.extname(file) === ".json"
  );

  // Total number of files to process
  const totalFiles = files.length;

  // Create a progress bar for merging
  const progressBar = multiBar.create(totalFiles, 0, {
    name: "Merging files",
    message: "",
  });

  let batchNumber = 0; // For naming the output files
  let objectsInCurrentOutputFile = 0;
  let currentOutputData = [];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const data = JSON.parse(await fsPromises.readFile(filePath, "utf8"));

    for (const item of data) {
      currentOutputData.push(item);
      objectsInCurrentOutputFile++;

      // If we've reached 10,000 objects, write to a new file
      if (objectsInCurrentOutputFile >= 10000) {
        const newFileName = `companyData_merged_batch_${batchNumber}.json`;
        const newFilePath = path.join(dirPath, newFileName);
        await fsPromises.writeFile(
          newFilePath,
          JSON.stringify(currentOutputData, null, 2)
        );

        // Reset for next batch
        batchNumber++;
        currentOutputData = [];
        objectsInCurrentOutputFile = 0;
      }
    }

    progressBar.increment();
  }

  // After processing all files, write any remaining data
  if (currentOutputData.length > 0) {
    const newFileName = `companyData_merged_batch_${batchNumber}.json`;
    const newFilePath = path.join(dirPath, newFileName);
    await fsPromises.writeFile(
      newFilePath,
      JSON.stringify(currentOutputData, null, 2)
    );
    batchNumber++;
  }

  progressBar.stop();

  // Delete old files
  const deleteProgressBar = multiBar.create(totalFiles, 0, {
    name: "Deleting old files",
    message: "",
  });

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    await fsPromises.unlink(filePath);
    deleteProgressBar.increment();
  }

  deleteProgressBar.stop();

  console.log(
    `Reorganized data into ${batchNumber} files with up to 10,000 records each.`
  );
}

// Main function to execute the process
async function main() {
  // Create a MultiBar instance
  const multiBar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format:
        "{bar} | {percentage}% | {value}/{total} | ETA: {eta_formatted} | {name} | {message}",
    },
    cliProgress.Presets.shades_classic
  );

  const oldDataChecksums = await cacheOldData(multiBar); // Cache old data checksums
  await fetchAndProcessData(oldDataChecksums, multiBar); // Fetch and process new data

  // Now, merge and reorganize files in a memory-efficient way
  await mergeAndReorganizeFiles(multiBar);

  multiBar.stop(); // Stop the MultiBar after all progress bars are done
  console.log("Process completed.");
}

/* Uncomment to run the main function if needed
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
*/

module.exports = { main };
