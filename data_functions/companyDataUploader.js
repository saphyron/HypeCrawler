const axios = require("axios");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto"); // For generating checksums
const cliProgress = require("cli-progress");

// Define the directory path for JSON files
const dirPath = path.join("E:", "Data", "JSON Files", "CompanyData");

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
async function cacheOldData() {
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Caching old data | {bar} | {percentage}% | {value}/{total} | ETA: {eta_formatted}",
    },
    cliProgress.Presets.shades_classic
  );

  let files = fs
    .readdirSync(dirPath)
    .filter((file) => path.extname(file) === ".json");
  const checksums = new Set();

  progressBar.start(files.length, 0);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    data.forEach((item) => checksums.add(generateChecksum(item)));
    progressBar.increment();
  }

  progressBar.stop();
  return checksums;
}

// Function to fetch and process data in batches
async function fetchAndProcessData(oldDataChecksums) {
  const totalRecordsEstimate = 2200000; // 2.2 million records estimate
  let recordsProcessed = 0;
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Processing new data | {bar} | {percentage}% | {value}/{total} | ETA: {eta_formatted}",
    },
    cliProgress.Presets.shades_classic
  );

  // Load credentials from config.json
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

  // Start progress bar with total estimate of 2.2 million
  progressBar.start(totalRecordsEstimate, 0, { totalFormatted: "2.2m" });

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
            ],
            query: {
              match_all: {},
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

        await compareAndSaveData(batch, oldDataChecksums); // Compare and save the batch

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
async function compareAndSaveData(batch, oldDataChecksums) {
  const newDataFound = [];

  for (const item of batch) {
    const itemChecksum = generateChecksum(item);

    if (!oldDataChecksums.has(itemChecksum)) {
      newDataFound.push(item); // Add new item to newDataFound
    }
  }

  if (newDataFound.length > 0) {
    console.log(`Found ${newDataFound.length} new items.`); // Log how many new items were found
    saveDataToFile(newDataFound); // Save the new items to file
  }
}

// Function to save data to a file
function saveDataToFile(data) {
  const batchNumber = getNextBatchNumber(); // Ensure you have this function
  const filePath = path.join(dirPath, `companyData_batch_${batchNumber}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Data saved to ${filePath}`);
}

// Main function to execute the process
async function main() {
  const oldDataChecksums = await cacheOldData(); // Cache old data checksums
  await fetchAndProcessData(oldDataChecksums); // Fetch and process new data
  console.log("Process completed.");
}

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
