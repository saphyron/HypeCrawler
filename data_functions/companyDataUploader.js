const fs = require("fs");
const path = require("path");
const orm = require("../database/databaseConnector");
const cliProgress = require("cli-progress"); // Import cli-progress
const util = require('util');

const dirPath = path.join("E:", "Data", "JSON Files", "CompanyData");

async function uploadData(connection) {
  console.log("Connected to the database.");

  const files = fs
    .readdirSync(dirPath)
    .filter((file) => /^companyData_batch_\d+\.json$/.test(file));

  console.log(`Found ${files.length} JSON files.`);

  let existingCVRNumbers = new Set();
  const fetchCVRQuery = `SELECT cvrNummer FROM companyData`;

  // Use util.promisify to make connection.query return a promise
  const queryAsync = util.promisify(connection.query).bind(connection);

  try {
    const cvrResults = await queryAsync(fetchCVRQuery);
    if (cvrResults) {
      cvrResults.forEach(row => existingCVRNumbers.add(row.cvrNummer));
      console.log(`Cached ${existingCVRNumbers.size} existing CVR numbers from the database.`);
    } else {
      console.warn("No existing CVR numbers found or unexpected response structure.");
    }
  } catch (error) {
    console.error("Error fetching existing CVR numbers:", error);
  }

  let uploadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(files.length, 0);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    let data;

    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      console.error(`Error parsing JSON in file ${filePath}:`, error);
      failedCount++;
      progressBar.increment(); // Increment progress for failed file
      continue; // Skip to the next file
    }

    for (const item of data) {
      const vrVirksomhed = item._source?.Vrvirksomhed;

      if (!vrVirksomhed) {
        console.warn("Vrvirksomhed not found for item:", item);
        continue; // Skip this item if Vrvirksomhed is missing
      }

      const id = item._id;
      const cvrNummer = vrVirksomhed.cvrNummer;

      //console.log("ID:", id, "CVR Number:", cvrNummer);

      // Check if the CVR number exists in the cached set
      if (existingCVRNumbers.has(cvrNummer)) {
        //console.log(`Skipping existing CVR Number: ${cvrNummer}`);
        skippedCount++;
        continue; // Skip to the next item if it already exists
      }

      // Prepare fields
      const kommuneNavn = vrVirksomhed?.beliggenhedsadresse && vrVirksomhed.beliggenhedsadresse.length > 0 
        ? vrVirksomhed.beliggenhedsadresse.reduce((latest, address) => {
            if (address.kommune && latest.kommune) {
              return new Date(address.kommune.sidstOpdateret) > new Date(latest.kommune.sidstOpdateret) ? address : latest;
            }
            return latest; 
          }).kommune?.kommuneNavn || null
        : null;

      const navn = vrVirksomhed?.navne && vrVirksomhed.navne.length > 0 
        ? vrVirksomhed.navne.reduce((latest, navn) => {
            if (navn && latest) {
              return new Date(navn.sidstOpdateret) > new Date(latest.sidstOpdateret) ? navn : latest;
            }
            return latest; 
          }).navn || null
        : null;

      const virksomhedsform = vrVirksomhed?.virksomhedsform[0]?.langBeskrivelse || null;

      const query = `INSERT INTO companyData (id, cvrNummer, kommuneNavn, navn, langBeskrivelse) VALUES (?, ?, ?, ?, ?)`;

      //console.log(`Inserting: ID=${id}, CVR Number=${cvrNummer}, Kommune Navn=${kommuneNavn}, Navn=${navn}, Virksomhedsform=${virksomhedsform}`);

      // Use async/await for the query execution
      try {
        await queryAsync(query, [id, cvrNummer, kommuneNavn, navn, virksomhedsform]);
        //console.log(`Inserted CVR Number: ${cvrNummer}`);
        uploadedCount++;
      } catch (error) {
        console.error("Error inserting data:", error);
        failedCount++;
      }
    }

    progressBar.increment();
  }

  progressBar.stop();
  console.log(`Data upload completed. Summary:`);
  console.log(`Total uploaded: ${uploadedCount}`);
  console.log(`Skipped (existing CVR): ${skippedCount}`);
  console.log(`Failed to upload: ${failedCount}`);

  connection.end(err => {
    if (err) console.error("Error ending connection:", err);
    console.log("Connection successfully ended.");
  });
}


async function createCompanyDataTable(connection) {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS companyData (
      id BIGINT,
      cvrNummer BIGINT NOT NULL,
      kommuneNavn VARCHAR(255),
      navn VARCHAR(255),
      langBeskrivelse VARCHAR(255),
      sidstOpdateret TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;

  try {
    await queryAsync(createTableQuery); // Await table creation query
    console.log("Table 'companyData' created or already exists.");
  } catch (error) {
    console.error("Error creating table:", error);
  }
}

// Main function to execute the process
async function main() {
  let connection;
  try {
    connection = await orm.connectDatabase(); // Establish connection once
    await createCompanyDataTable(connection);
    await uploadData(connection);
    console.log("Process completed.");
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    if (connection) {
      await orm.disconnectDatabase(); // Ensure to disconnect
      console.log("Connection closed.");
    }
  }
}

module.exports = { main };
