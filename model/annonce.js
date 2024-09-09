class Annonce {
    constructor(title, body, regionId, timestamp, checksum, url, cvr, homepage, possible_duplicate) {
        this.titel = title;
        this.body = body;
        this.regionId = regionId;
        this.timestamp = timestamp;
        this.checksum = checksum;
        this.url = url;
        this.cvr = cvr;
        this.homepage = homepage;
        this.possible_duplicate = possible_duplicate;
    }
}
module.exports = Annonce;
