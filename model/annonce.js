class Annonce {
    constructor(title, body, regionId, timestamp, checksum, url, cvr) {
        this.titel = title;
        this.body = body;
        this.regionId = regionId;
        this.timestamp = timestamp;
        this.checksum = checksum;
        this.url = url;
        this.cvr = cvr;
    }
}
module.exports = Annonce;
