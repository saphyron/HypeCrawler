const orm = require("../database/databaseConnector"); // DB connector
const bannedCompanies = ["Jobindex", "Careerjet"]; // Banned list
const util = require("util");

let cachedCompanies = []; // Cache for companies

async function fetchCompanies(connection) {
  const queryAsync = util.promisify(connection.query).bind(connection);
  const companiesQuery = "SELECT navn, cvrNummer FROM companyData";
  console.log("Fetching company data...");

  try {
    const [companies] = await queryAsync(companiesQuery);
    if (Array.isArray(companies)) {
      console.log(`Found ${companies.length} companies.`);
      cachedCompanies = companies; // Store companies in cache
    } else {
      console.error("Failed to fetch companies: Result is not an array.");
    }
  } catch (error) {
    console.error("Error fetching companies:", error);
  }
}

async function updateJobCVR(job, connection) {
  const queryAsync = util.promisify(connection.query).bind(connection);
  let foundCVR = null;

  // Convert job body to string and lowercase for case-insensitive comparison
  const bodyString = job.BODY ? job.BODY.toString("utf-8") : "";
  const bodyLowerCase = bodyString.toLowerCase();
  const titleLowerCase = job.TITLE.toLowerCase();

  // Check for company names in the job body
  for (const company of cachedCompanies) {
    const companyNameLowerCase = company.navn.toLowerCase();
    const bodyWords = bodyLowerCase.split(/\s+/);

    if (bodyWords.some((word) => word === companyNameLowerCase)) {
      if (!bannedCompanies.includes(company.navn)) {
        console.log(
          `Found company name: ${company.navn} in job body. Updating CVR.`
        );
        foundCVR = company.cvrNummer;
        break; // Stop searching if a match is found
      } else {
        console.log(`Skipping banned company: ${company.navn}`);
      }
    }
  }

  // If no company name is found in the body, check the job title
  if (!foundCVR) {
    for (const company of cachedCompanies) {
      const companyNameLowerCase = company.navn.toLowerCase();
      const titleWords = titleLowerCase.split(/\s+/);

      if (titleWords.some((word) => word === companyNameLowerCase)) {
        if (!bannedCompanies.includes(company.navn)) {
          console.log(
            `Found company name: ${company.navn} in job title. Updating CVR.`
          );
          foundCVR = company.cvrNummer;
          break;
        } else {
          console.log(`Skipping banned company: ${company.navn}`);
        }
      }
    }
  }

  // If no match is found in either the body or title, set CVR to an empty string
  if (!foundCVR) {
    foundCVR = "";
  }

  // Update the job record with the found CVR number
  console.log(`Updating job with ID: ${job.ID}`);
  const updateQuery = "UPDATE annonce SET CVR = ? WHERE ID = ?";
  await queryAsync(updateQuery, [foundCVR, job.ID]);

  console.log(`Updated job ${job.ID} with CVR number: ${foundCVR}`);
}

// Example of running the script for jobs added today
async function main() {
  console.log("Connecting to the database...");
  const connection = await orm.connectDatabase();
  const queryAsync = util.promisify(connection.query).bind(connection);
  console.log("Database connected.");

  try {
    // Fetch companies once and cache them
    await fetchCompanies(connection);

    const query =
      "SELECT BODY, TITLE, CVR, ID FROM annonce WHERE CVR IS NULL AND timestamp >= CURDATE() AND timestamp < CURDATE() + INTERVAL 1 DAY";
    console.log("Executing query:", query);
    const result = await queryAsync(query);

    console.log("Query result:", result);

    const jobs = result || []; // Change here
    console.log(`Found ${jobs.length} jobs.`);

    for (const job of jobs) {
      console.log(`Processing job ${job.ID}...`);
      await updateJobCVR(job, connection); // No need to pass connection here
    }
  } catch (error) {
    console.error("Error fetching jobs:", error);
  } finally {
    await orm.disconnectDatabase();
  }
}

module.exports = { main };

// Execute the main function if this script is run directly
if (require.main === module) {
  main();
}
