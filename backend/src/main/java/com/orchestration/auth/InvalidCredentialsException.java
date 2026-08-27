package com.orchestration.auth;

/** Thrown for any login failure (unknown id, wrong password, disabled account). The message is intentionally
 * generic and identical for every case — never reveal which part of the credential pair was wrong, since
 * that distinction is exactly what lets an attacker enumerate valid account ids. */
public class InvalidCredentialsException extends RuntimeException {
  InvalidCredentialsException() { super("아이디 또는 비밀번호가 올바르지 않습니다."); }
}
