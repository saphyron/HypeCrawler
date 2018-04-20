class Annonce {
    constructor(title, body, regionId, timestamp, checksum) {
        this.titel = title;
        this.body = body;
        this.regionId = regionId;
        this.timestamp = timestamp;
        this.checksum = checksum;
    }
}
module.exports = Annonce;
