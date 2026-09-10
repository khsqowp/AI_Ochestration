package com.orchestration.access;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** Per-IP geolocation cache. Filled from Cloudflare visitor-location headers when present
 * ({@code accuracy = "cf"}), otherwise backfilled in batches from ip-api.com ({@code "ipapi"}).
 * Private / loopback addresses get {@code "local"} and are kept off the map. */
@Entity
@Table(name = "ip_location")
public class IpLocation {
  @Id @Column(length = 45) private String ip;

  @Column(length = 2) private String countryCode;
  @Column(length = 64) private String country;
  @Column(length = 96) private String region;
  @Column(length = 96) private String city;
  private double lat;
  private double lon;
  @Column(length = 128) private String isp;
  @Column(length = 128) private String org;
  @Column(length = 8, nullable = false) private String accuracy = "none";
  @Column(nullable = false) private Instant resolvedAt = Instant.now();

  protected IpLocation() {}

  public IpLocation(String ip) { this.ip = ip; }

  public void set(String countryCode, String country, String region, String city,
                  double lat, double lon, String isp, String org, String accuracy) {
    this.countryCode = countryCode;
    this.country = country;
    this.region = region;
    this.city = city;
    this.lat = lat;
    this.lon = lon;
    this.isp = isp;
    this.org = org;
    this.accuracy = accuracy;
    this.resolvedAt = Instant.now();
  }

  public String getIp() { return ip; }
  public String getCountryCode() { return countryCode; }
  public String getCountry() { return country; }
  public String getRegion() { return region; }
  public String getCity() { return city; }
  public double getLat() { return lat; }
  public double getLon() { return lon; }
  public String getIsp() { return isp; }
  public String getOrg() { return org; }
  public String getAccuracy() { return accuracy; }
  public Instant getResolvedAt() { return resolvedAt; }
}
