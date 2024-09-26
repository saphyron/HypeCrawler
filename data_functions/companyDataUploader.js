const fs = require("fs");
const path = require("path");
const orm = require("../database/databaseConnector");
const cliProgress = require("cli-progress");
const util = require("util");

const dirPath = path.join("E:", "Data", "JSON Files", "CompanyData");

async function uploadData(connection) {
  console.log("Connected to the database.");

  // Updated regex to match the new file naming pattern
  const files = fs
    .readdirSync(dirPath)
    .filter((file) => /^companyData_merged_batch_\d+\.json$/.test(file));

  console.log(`Found ${files.length} JSON files.`);

  let existingCVRNumbers = new Set();
  const fetchCVRQuery = `SELECT cvrNummer FROM companyData`;

  // Use util.promisify to make connection.query return a promise
  const queryAsync = util.promisify(connection.query).bind(connection);

  try {
    const cvrResults = await queryAsync(fetchCVRQuery);
    if (cvrResults) {
      cvrResults.forEach((row) => existingCVRNumbers.add(row.cvrNummer));
      console.log(
        `Cached ${existingCVRNumbers.size} existing CVR numbers from the database.`
      );
    } else {
      console.warn(
        "No existing CVR numbers found or unexpected response structure."
      );
    }
  } catch (error) {
    console.error("Error fetching existing CVR numbers:", error);
  }

  let uploadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Initialize the progress bar with message handling
  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "{bar} | {percentage}% | {value}/{total} | ETA: {eta_formatted} | {message}",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );
  progressBar.start(files.length, 0, { message: "" });

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    let data;

    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      failedCount++;
      // Update the progress bar message instead of console.error
      progressBar.update(progressBar.value, {
        message: `Error parsing JSON in file ${file}: ${error.message}`,
      });
      // Optionally clear the message after a delay
      setTimeout(() => {
        progressBar.update(progressBar.value, { message: "" });
      }, 5000);
      progressBar.increment();
      continue; // Skip to the next file
    }

    for (const item of data) {
      const vrVirksomhed = item._source?.Vrvirksomhed;

      if (!vrVirksomhed) {
        skippedCount++;
        // Update the progress bar message
        progressBar.update(progressBar.value, {
          message: "Vrvirksomhed not found for an item.",
        });
        // Optionally clear the message after a delay
        setTimeout(() => {
          progressBar.update(progressBar.value, { message: "" });
        }, 5000);
        continue; // Skip this item if Vrvirksomhed is missing
      }

      const id = item._id;
      const cvrNummer = vrVirksomhed.cvrNummer;

      // Check if the CVR number exists in the cached set
      if (existingCVRNumbers.has(cvrNummer)) {
        skippedCount++;
        continue; // Skip to the next item if it already exists
      }

      // Prepare fields
      const kommuneNavn =
        vrVirksomhed?.beliggenhedsadresse &&
        vrVirksomhed.beliggenhedsadresse.length > 0
          ? vrVirksomhed.beliggenhedsadresse
              .reduce((latest, address) => {
                if (address.kommune && latest.kommune) {
                  return new Date(address.kommune.sidstOpdateret) >
                    new Date(latest.kommune.sidstOpdateret)
                    ? address
                    : latest;
                }
                return latest;
              })
              .kommune?.kommuneNavn || null
          : null;

      const navn =
        vrVirksomhed?.navne && vrVirksomhed.navne.length > 0
          ? vrVirksomhed.navne
              .reduce((latest, navn) => {
                if (navn && latest) {
                  return new Date(navn.sidstOpdateret) >
                    new Date(latest.sidstOpdateret)
                    ? navn
                    : latest;
                }
                return latest;
              })
              .navn || null
          : null;

      const virksomhedsform =
        vrVirksomhed?.virksomhedMetadata?.nyesteVirksomhedsform
          ?.langBeskrivelse || null;

      const ansatte =
        vrVirksomhed?.virksomhedMetadata?.nyesteMaanedsbeskaeftigelse
          ?.antalAnsatte || null;
      const creationDate =
        vrVirksomhed?.virksomhedMetadata?.stiftelsesDato || null;
      const antalAarsvaerk =
        vrVirksomhed?.virksomhedMetadata?.nyesteMaanedsbeskaeftigelse
          ?.antalAarsvaerk || null;
      const brancheTekst =
        vrVirksomhed?.virksomhedMetadata?.nyesteHovedbranche?.branchetekst ||
        null;
      const brancheCode =
        vrVirksomhed?.virksomhedMetadata?.nyesteHovedbranche?.branchekode ||
        null;
      const kontaktOplysninger =
        vrVirksomhed?.virksomhedMetadata?.nyesteKontaktoplysninger || [];
      const url = extractUrl(kontaktOplysninger) || null;

      const query = `INSERT INTO companyData (id, cvrNummer, kommuneNavn, navn, langBeskrivelse, antalAnsatte, creationDate, antalAarsvaerk, url, brancheTekst, brancheCode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      // Use async/await for the query execution
      try {
        await queryAsync(query, [
          id,
          cvrNummer,
          kommuneNavn,
          navn,
          virksomhedsform,
          ansatte,
          creationDate,
          antalAarsvaerk,
          url,
          brancheTekst,
          brancheCode,
        ]);
        uploadedCount++;
      } catch (error) {
        failedCount++;
        // Update the progress bar message
        progressBar.update(progressBar.value, {
          message: `Error inserting data for CVR ${cvrNummer}: ${error.message}`,
        });
        // Optionally clear the message after a delay
        setTimeout(() => {
          progressBar.update(progressBar.value, { message: "" });
        }, 5000);
      }
    }

    progressBar.increment();
  }

  progressBar.stop();
  console.log(`Data upload completed. Summary:`);
  console.log(`Total uploaded: ${uploadedCount}`);
  console.log(`Skipped (existing CVR): ${skippedCount}`);
  console.log(`Failed to upload: ${failedCount}`);

  connection.end((err) => {
    if (err) console.error("Error ending connection:", err);
    console.log("Connection successfully ended.");
  });
}

function extractUrl(contactDetails) {
  if (!Array.isArray(contactDetails) || contactDetails.length === 0) {
    return null;
  }

  const urlPattern = /^(https?:\/\/)?(www\.)?[\w-]+\.[\w.-]+(\.[\w.-]+)*(:\d+)?(\/.*)?$/i;

  for (const contact of contactDetails) {
    // Skip empty strings or null values
    if (!contact) continue;

    // Check if the contact string matches a URL pattern
    if (urlPattern.test(contact)) {
      // Ensure the URL has a scheme (http or https)
      if (!contact.startsWith('http://') && !contact.startsWith('https://')) {
        return 'http://' + contact;
      }
      return contact;
    }
  }

  return null;
}


async function createCompanyDataTable(connection) {
  // Use util.promisify to make connection.query return a promise
  const queryAsync = util.promisify(connection.query).bind(connection);

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS companyData (
      id varchar(255),
      cvrNummer BIGINT NOT NULL,
      kommuneNavn VARCHAR(255),
      navn VARCHAR(255),
      langBeskrivelse VARCHAR(255),
      antalAnsatte int,
      creationDate DATE,
      antalAarsvaerk int,
      url varchar(255),
      brancheTekst varchar(255),
      brancheCode varchar(255),
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
  }
}

module.exports = { main };
