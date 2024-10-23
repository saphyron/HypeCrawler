/**
 * @file duplicatesChecker.js
 * @description Checks the 'annonce' table for potential duplicate entries based on title, body hash, and timestamp.
 * Updates the 'possible_duplicate' column for records identified as duplicates.
 */

 // Import the ORM module for database operations
 const orm = require("../database/databaseConnector");

 /**
  * Checks for potential duplicate records in the 'annonce' table and updates the 'possible_duplicate' flag.
  * Duplicates are identified based on matching title, body_hash, and date of the timestamp.
  *
  * @async
  * @function checkForDuplicates
  * @returns {Promise<void>}
  * @throws Will throw an error if database operations fail.
  */
 async function checkForDuplicates() {
   let connection; // Variable to hold the database connection
 
   try {
     // Establish a database connection
     connection = await orm.connectDatabase();
 
     // SQL query to find potential duplicates from today based on title, body_hash, and date
     const query1 = `
             SELECT id, title, body_hash, DATE(timestamp) AS date_group, COUNT(*) as count
             FROM annonce
             WHERE timestamp BETWEEN CURDATE() AND CURDATE() + INTERVAL 1 DAY
             AND body_hash IS NOT NULL
             GROUP BY title, body_hash, DATE(timestamp)
             HAVING count > 1;
         `;
 
     // SQL query to find potential duplicates across all dates based on title, body_hash, and date
     const query2 = `
             SELECT id, title, body_hash, DATE(timestamp) AS date_group, COUNT(*) as count
             FROM annonce
             WHERE body_hash IS NOT NULL
             GROUP BY title, body_hash, DATE(timestamp)
             HAVING count > 1;
     `;
 
     // Execute the query to find duplicates using query1
     const results = await new Promise((resolve, reject) => {
       connection.query(query1, (error, results) => {
         if (error) {
           return reject("Error querying for duplicates: " + error);
         }
         resolve(results);
       });
     });
 
     // Check if any duplicates were found
     if (results.length > 0) {
       console.log(`Found ${results.length} potential duplicate(s).`);
 
       // Loop through the results to update the possible_duplicate column
       for (const row of results) {
         // SQL query to update the possible_duplicate column for all matching records
         const updateQuery = `
           UPDATE annonce
           SET possible_duplicate = 1
           WHERE title = ?
             AND body_hash = ?
             AND DATE(timestamp) = ?;
         `;
 
         // Execute the update query
         const updateResult = await new Promise((resolve, reject) => {
           connection.query(
             updateQuery,
             [row.title, row.body_hash, row.date_group], // Match the title, body_hash, and date
             (updateError, result) => {
               if (updateError) {
                 return reject(
                   "Error updating possible_duplicate: " + updateError
                 );
               }
               resolve(result);
             }
           );
         });
 
         // Log the outcome of the update operation
         if (updateResult.affectedRows > 0) {
           console.log(
             `Marked ${updateResult.affectedRows} records as possible duplicates for title '${row.title}' on ${row.date_group}.`
           );
         } else {
           console.log(
             `Record(s) for title '${row.title}' on ${row.date_group} were not updated.`
           );
         }
       }
     } else {
       console.log("No duplicates found.");
     }
   } catch (error) {
     console.error(`Error: ${error}`);
   } finally {
     if (connection) {
       // Close the database connection
       await orm.disconnectDatabase();
     }
   }
 }
 
 // Export the checkForDuplicates function as a module to be used elsewhere
 module.exports = { checkForDuplicates };
 