const fs = require('fs');
const path = require('path');
const orm = require('./general-orm-1.0.0'); // Adjust the path as necessary

async function exportToCSV() {
    console.log('Starting exportToCSV function');
    try {
        const connection = await orm.connectDatabase();
        console.log('Database connection established');

        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD

        const query = `
            SELECT a.id, a.body as searchable_body, r.region_id, r.name as region_name, a.timestamp, a.title, a.cvr
            FROM annonce a
            INNER JOIN region r ON r.region_id = a.region_id
            WHERE DATE(a.timestamp) = '${formattedDate}'
            GROUP BY a.id;
        `;

        console.log('Executing query:', query);
        connection.query(query, (err, results, fields) => {
            if (err) {
                console.error('Error executing query:', err);
                connection.end();
                return;
            }

            console.log('Query executed successfully');
            console.log('Results:', results);

            if (results.length === 0) {
                console.log('No data returned from the query.');
                connection.end();
                return;
            }

            // Convert the results to JSON and handle special cases
            const jsonData = results.map(row => {
                let jsonObject = {};
                fields.forEach((field) => {
                    let value = row[field.name];

                    // If the field is a Buffer, convert it to a string
                    if (Buffer.isBuffer(value)) {
                        value = value.toString('utf8');
                    }

                    // Convert null or empty values to "n/a"
                    if (value === null || value === '') {
                        value = 'n/a';
                    }

                    // Ensure proper handling of text fields, such as replacing newlines
                    if (typeof value === 'string') {
                        value = value.replace(/\r?\n|\r/g, ' ').trim(); // Replace newlines with space and trim
                    }

                    jsonObject[field.name] = value;
                });
                return jsonObject;
            });

            console.log('JSON Data:', jsonData);

            const datePart = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const fileName = `${datePart}_data.json`;

            const outputDir = 'C:\\Users\\jgra\\Desktop\\CSV Files';
            const outputPath = path.join(outputDir, fileName);

            console.log('Writing JSON file:', outputPath);
            fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf8');
            console.log('JSON file written successfully');
            connection.end();

            /*// Convert JSON back to CSV
            const columns = fields.map(field => field.name);
            const csvContent = [
                columns.join(';'), // Header row with comma separator
                ...jsonData.map(record => 
                    columns.map(col => `"${record[col]}"`).join(';') // Data rows wrapped in quotes and comma-separated
                )
            ].join('\n');

            const datePart = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const fileName = `${datePart} _${columns.length}.csv`;

            const outputDir = 'C:\\Users\\jgra\\Desktop\\CSV Files';
            const outputPath = path.join(outputDir, fileName);

            console.log('Writing CSV file:', outputPath);
            const BOM = '\uFEFF';
            fs.writeFileSync(outputPath, BOM + csvContent, 'utf8'); // Add BOM for UTF-8 compatibility
            console.log('CSV file written successfully');
            connection.end();*/
        });
    } catch (error) {
        console.log("Error at main → connectDatabase(): " + error);
        throw error;
    }
}

module.exports = { exportToCSV };
