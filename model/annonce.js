const mysql = require('mysql');

class Annonce {
    constructor(title, body, timestamp, expiringDate, creationDate) {
        this.titel = title;
        this.body = body;
        this.timestamp = timestamp;
        this.expiringDate = expiringDate;
        this.creationDate = creationDate;
    }
}
module.exports = Annonce;
