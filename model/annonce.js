/**
 * @file annonce.js
 * @description Defines the Annonce class representing a record in the 'annonce' table of the database.
 * This class models the structure of an announcement (annonce) with properties that map to the database fields.
 */

class Annonce {
    /**
     * Creates an instance of the Annonce class.
     *
     * @param {string} title - The title of the announcement.
     * @param {string} body - The body content of the announcement.
     * @param {number} regionId - The ID of the region associated with the announcement.
     * @param {Date|string} timestamp - The timestamp when the announcement was created.
     * @param {string} checksum - The checksum value for data integrity.
     * @param {string} url - The URL of the announcement.
     * @param {string|number} cvr - The CVR number associated with the announcement.
     * @param {string} homepage - The homepage URL of the source website.
     * @param {boolean} possible_duplicate - Flag indicating if the announcement is a possible duplicate.
     * @param {string} body_hash - The hash of the body content for duplicate detection.
     * @param {string} companyUrlFromAnnonce - The company URL extracted from the announcement.
     */
    constructor(title, body, regionId, timestamp, checksum, url, cvr, homepage, possible_duplicate, body_hash, companyUrlFromAnnonce) {
        this.titel = title; 
        this.body = body;
        this.regionId = regionId;
        this.timestamp = timestamp;
        this.checksum = checksum;
        this.url = url;
        this.cvr = cvr;
        this.homepage = homepage;
        this.possible_duplicate = possible_duplicate;
        this.body_hash = body_hash;
        this.companyUrlFromAnnonce = companyUrlFromAnnonce;
    }
}

// Export the Annonce class for use in other modules
module.exports = Annonce;
