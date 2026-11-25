package com.orchestration.diag;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.net.URI;
import java.util.List;
import org.junit.jupiter.api.Test;

class NetworkDiagnosticsServiceTest {
  private final NetworkDiagnosticsService service = new NetworkDiagnosticsService(new ObjectMapper(), mock(NetworkDiagnosticRunRepository.class));

  @Test void bareHostnameUsesHttpOnPort80AndHttpsOnPort443() throws Exception {
    Object target = parseTarget("naver.com");
    assertEquals(URI.create("http://naver.com:80/"), requestUri(target, 80));
    assertEquals(URI.create("https://naver.com:443/"), requestUri(target, 443));
  }

  @Test void explicitHttpsSchemeWithoutPortStillUsesHttpOnPort80() throws Exception {
    Object target = parseTarget("https://naver.com");
    assertEquals(URI.create("http://naver.com:80/"), requestUri(target, 80));
    assertEquals(URI.create("https://naver.com:443/"), requestUri(target, 443));
  }

  @Test void explicitHttpsUrlWithCustomPortIsHonored() throws Exception {
    Object target = parseTarget("https://example.test:8443");
    assertEquals(URI.create("https://example.test:8443/"), requestUri(target, 8443));
  }

  @Test void tcpSucceededButHttpFailedIsNotBlamedOnFirewall() throws Exception {
    Object target = parseTarget("naver.com");
    List<Boolean> tcpOk = List.of(true, true);
    List<Object> direct = List.of(probe(0, "실패/시간초과: IOException: Stream 1 cancelled"), probe(0, "실패/시간초과: SSLException"));
    String verdict = verdict(target, List.of(80, 443), direct, List.of(), false, false, false, tcpOk, List.of());
    assertFalse(verdict.contains("방화벽/이그레스 정책 차단 가능성이 큽니다"), verdict);
    assertTrue(verdict.contains("TCP 연결은 성공"), verdict);
    assertTrue(verdict.contains("WAF"), verdict);
  }

  @Test void tcpFailedStillReportsFirewallBlock() throws Exception {
    Object target = parseTarget("naver.com");
    List<Object> direct = List.of(probe(0, "x"), probe(0, "x"));
    String verdict = verdict(target, List.of(80, 443), direct, List.of(), false, false, false, List.of(false, false), List.of());
    assertTrue(verdict.contains("방화벽/이그레스 정책 차단 가능성이 큽니다"), verdict);
  }

  private Object parseTarget(String value) throws Exception {
    Method method = NetworkDiagnosticsService.class.getDeclaredMethod("parseTarget", String.class);
    method.setAccessible(true);
    return method.invoke(service, value);
  }

  private URI requestUri(Object target, int port) throws Exception {
    Method method = target.getClass().getDeclaredMethod("requestUri", int.class);
    method.setAccessible(true);
    return (URI) method.invoke(target, port);
  }

  private Object probe(int status, String detail) throws Exception {
    Class<?> type = Class.forName("com.orchestration.diag.NetworkDiagnosticsService$HttpProbe");
    Constructor<?> constructor = type.getDeclaredConstructor(int.class, String.class);
    constructor.setAccessible(true);
    return constructor.newInstance(status, detail);
  }

  @SuppressWarnings("unchecked")
  private String verdict(Object target, List<Integer> ports, List<Object> direct, List<Object> proxied, boolean hasProxy, boolean sanityOk, boolean tunnel,
      List<Boolean> tcpOk, List<?> tls) throws Exception {
    Method method = NetworkDiagnosticsService.class.getDeclaredMethod("verdict", target.getClass(), List.class, List.class, List.class,
        boolean.class, boolean.class, boolean.class, List.class, List.class);
    method.setAccessible(true);
    return (String) method.invoke(service, target, ports, direct, proxied, hasProxy, sanityOk, tunnel, tcpOk, tls);
  }
}
