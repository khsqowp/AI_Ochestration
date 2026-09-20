package com.orchestration.training;

import java.util.Locale;

/** A validated intent. It carries no simulated result and is safe to hand to a virtual target. */
record BlackBoxCommand(Type type, String account, String method, String path, String question) {
  enum Type { INFO, LOGIN, LOGOUT, REQUEST, SEQUENCE, INSPECT, UNKNOWN }

  static BlackBoxCommand info(String question) { return new BlackBoxCommand(Type.INFO, "", "", "", question); }
  static BlackBoxCommand login(String account) { return new BlackBoxCommand(Type.LOGIN, account.toUpperCase(Locale.ROOT), "", "", ""); }
  static BlackBoxCommand logout() { return new BlackBoxCommand(Type.LOGOUT, "", "", "", ""); }
  static BlackBoxCommand request(String method, String path) { return new BlackBoxCommand(Type.REQUEST, "", method.toUpperCase(Locale.ROOT), path, ""); }
  static BlackBoxCommand sequence(String account, String method, String path, String question) { return new BlackBoxCommand(Type.SEQUENCE, account.toUpperCase(Locale.ROOT), method.toUpperCase(Locale.ROOT), path, question); }
  static BlackBoxCommand inspect() { return inspect(""); }
  static BlackBoxCommand inspect(String question) { return new BlackBoxCommand(Type.INSPECT, "", "", "", question == null ? "" : question); }
  static BlackBoxCommand unknown() { return new BlackBoxCommand(Type.UNKNOWN, "", "", "", ""); }
}
