package com.orchestration.access;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface AccessEventRepository extends JpaRepository<AccessEvent, UUID> {
  List<AccessEvent> findAllByOrderByTsDesc(Pageable pageable);

  long countByTsAfter(Instant since);

  long deleteByTsBefore(Instant cutoff);

  @Query("select distinct e.ip from AccessEvent e where e.ip not in (select l.ip from IpLocation l)")
  List<String> findIpsWithoutLocation();

  @Query("""
      select e.ip as ip, count(e) as hits, max(e.ts) as lastSeen,
             sum(case when e.hadSession = true then 1 else 0 end) as sessionHits
      from AccessEvent e group by e.ip""")
  List<IpAggregate> aggregateByIp();

  interface IpAggregate {
    String getIp();
    long getHits();
    Instant getLastSeen();
    long getSessionHits();
  }
}

interface IpLocationRepository extends JpaRepository<IpLocation, String> {
  @Query("select l from IpLocation l where l.ip = :ip")
  IpLocation get(@Param("ip") String ip);
}
