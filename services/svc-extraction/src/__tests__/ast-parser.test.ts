import { describe, it, expect } from "vitest";
import {
  parseSpringController,
  parseServiceClass,
  isControllerClass,
  isServiceClass,
  extractClassName,
  extractPackageName,
  extractClassRequestMapping,
  extractEndpoints,
} from "../factcheck/ast-parser.js";

// ── Test Fixtures ───────────────────────────────────────────────

const BASIC_CONTROLLER = `
package com.onnuripay.api.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/onnuripay/v1.0/charge")
public class ChargeController {

    @PostMapping("/create")
    public ResponseEntity<ChargeResponse> createCharge(
        @RequestBody ChargeRequest request
    ) {
        return chargeService.create(request);
    }

    @GetMapping("/list")
    public ResponseEntity<List<ChargeDto>> listCharges(
        @RequestParam String userId,
        @RequestParam(required=false) String status
    ) {
        return chargeService.list(userId, status);
    }

    @PutMapping("/cancel/{chargeId}")
    public ResponseEntity<Void> cancelCharge(
        @PathVariable Long chargeId
    ) {
        return chargeService.cancel(chargeId);
    }
}
`;

const REQUEST_MAPPING_WITH_METHOD = `
package com.onnuripay.api.controller;

@Controller
@RequestMapping(value = "/api/v1/gift")
public class GiftController {

    @RequestMapping(value = "/send", method = RequestMethod.POST)
    public ResponseEntity<GiftResult> sendGift(
        @RequestBody GiftRequest request
    ) {
        return giftService.send(request);
    }

    @RequestMapping(value = "/status/{giftId}", method = {RequestMethod.GET, RequestMethod.HEAD})
    public ResponseEntity<GiftStatus> getGiftStatus(
        @PathVariable String giftId
    ) {
        return giftService.getStatus(giftId);
    }

    @RequestMapping("/list")
    public ResponseEntity<List<GiftDto>> listGifts() {
        return giftService.list();
    }
}
`;

const SWAGGER_CONTROLLER = `
package com.onnuripay.api.controller;

import io.swagger.annotations.*;

@RestController
@RequestMapping("/onnuripay/v1.0/member")
@Api(tags = "회원 관리")
public class MemberController {

    @ApiOperation(value = "회원 가입")
    @PostMapping("/join")
    public ResponseEntity<MemberDto> joinMember(
        @RequestBody JoinRequest request
    ) {
        return memberService.join(request);
    }

    @ApiOperation("회원 조회")
    @GetMapping("/{memberId}")
    public ResponseEntity<MemberDto> getMember(
        @PathVariable Long memberId
    ) {
        return memberService.get(memberId);
    }
}
`;

const SERVICE_CLASS = `
package com.onnuripay.api.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChargeService {

    private final ChargeMapper chargeMapper;
    private final AccountDao accountDao;

    @Transactional
    public ChargeResponse create(ChargeRequest request) {
        accountDao.debitAccount(request.getAccountNo());
        chargeMapper.insertCharge(request);
        return new ChargeResponse();
    }

    @Transactional(readOnly = true)
    public List<ChargeDto> list(String userId, String status) {
        return chargeMapper.selectCharges(userId, status);
    }

    public void cancel(Long chargeId) {
        chargeMapper.updateChargeStatus(chargeId, "CANCELLED");
        accountDao.creditAccount(chargeId);
    }
}
`;

const NOT_A_CONTROLLER = `
package com.onnuripay.api.util;

public class DateUtils {
    public static String formatDate(Date date) {
        return new SimpleDateFormat("yyyy-MM-dd").format(date);
    }
}
`;

// ── Class Detection ─────────────────────────────────────────────

describe("isControllerClass", () => {
  it("@RestController 감지", () => {
    expect(isControllerClass(BASIC_CONTROLLER)).toBe(true);
  });

  it("@Controller 감지", () => {
    expect(isControllerClass(REQUEST_MAPPING_WITH_METHOD)).toBe(true);
  });

  it("일반 클래스는 false", () => {
    expect(isControllerClass(NOT_A_CONTROLLER)).toBe(false);
  });

  it("@Service는 false", () => {
    expect(isControllerClass(SERVICE_CLASS)).toBe(false);
  });
});

describe("isServiceClass", () => {
  it("@Service 감지", () => {
    expect(isServiceClass(SERVICE_CLASS)).toBe(true);
  });

  it("@Controller는 false", () => {
    expect(isServiceClass(BASIC_CONTROLLER)).toBe(false);
  });
});

// ── Class Metadata Extraction ───────────────────────────────────

describe("extractClassName", () => {
  it("컨트롤러 클래스명 추출", () => {
    expect(extractClassName(BASIC_CONTROLLER)).toBe("ChargeController");
  });

  it("서비스 클래스명 추출", () => {
    expect(extractClassName(SERVICE_CLASS)).toBe("ChargeService");
  });
});

describe("extractPackageName", () => {
  it("패키지명 추출", () => {
    expect(extractPackageName(BASIC_CONTROLLER)).toBe("com.onnuripay.api.controller");
  });

  it("서비스 패키지명 추출", () => {
    expect(extractPackageName(SERVICE_CLASS)).toBe("com.onnuripay.api.service");
  });
});

describe("extractClassRequestMapping", () => {
  it("@RequestMapping(\"/path\") 직접 문자열", () => {
    expect(extractClassRequestMapping(BASIC_CONTROLLER)).toBe("/onnuripay/v1.0/charge");
  });

  it("@RequestMapping(value = \"/path\") value 속성", () => {
    expect(extractClassRequestMapping(REQUEST_MAPPING_WITH_METHOD)).toBe("/api/v1/gift");
  });

  it("@RequestMapping 없는 클래스는 빈 문자열", () => {
    expect(extractClassRequestMapping(NOT_A_CONTROLLER)).toBe("");
  });
});

// ── Endpoint Extraction ─────────────────────────────────────────

describe("extractEndpoints", () => {
  it("@PostMapping, @GetMapping, @PutMapping 추출", () => {
    const endpoints = extractEndpoints(BASIC_CONTROLLER);
    expect(endpoints).toHaveLength(3);

    const create = endpoints.find((e) => e.methodName === "createCharge");
    expect(create).toBeDefined();
    expect(create?.httpMethod).toEqual(["POST"]);
    expect(create?.path).toBe("/create");
    expect(create?.parameters).toHaveLength(1);
    expect(create?.parameters[0]?.annotation).toBe("@RequestBody");

    const list = endpoints.find((e) => e.methodName === "listCharges");
    expect(list).toBeDefined();
    expect(list?.httpMethod).toEqual(["GET"]);
    expect(list?.path).toBe("/list");
    expect(list?.parameters).toHaveLength(2);

    const cancel = endpoints.find((e) => e.methodName === "cancelCharge");
    expect(cancel).toBeDefined();
    expect(cancel?.httpMethod).toEqual(["PUT"]);
    expect(cancel?.path).toBe("/cancel/{chargeId}");
    expect(cancel?.parameters[0]?.annotation).toBe("@PathVariable");
  });

  it("@RequestMapping(method = ...) 해석", () => {
    const endpoints = extractEndpoints(REQUEST_MAPPING_WITH_METHOD);
    expect(endpoints).toHaveLength(3);

    const send = endpoints.find((e) => e.methodName === "sendGift");
    expect(send?.httpMethod).toEqual(["POST"]);
    expect(send?.path).toBe("/send");

    const status = endpoints.find((e) => e.methodName === "getGiftStatus");
    expect(status?.httpMethod).toEqual(["GET", "HEAD"]);
    expect(status?.path).toBe("/status/{giftId}");

    const listEndpoint = endpoints.find((e) => e.methodName === "listGifts");
    expect(listEndpoint?.httpMethod).toEqual(["GET"]); // default
    expect(listEndpoint?.path).toBe("/list");
  });

  it("파라미터 required=false 처리", () => {
    const endpoints = extractEndpoints(BASIC_CONTROLLER);
    const list = endpoints.find((e) => e.methodName === "listCharges");
    const statusParam = list?.parameters.find((p) => p.name === "status");
    expect(statusParam?.required).toBe(false);
  });

  it("@RequestBody는 required false 기본", () => {
    const endpoints = extractEndpoints(BASIC_CONTROLLER);
    const create = endpoints.find((e) => e.methodName === "createCharge");
    const bodyParam = create?.parameters.find((p) => p.annotation === "@RequestBody");
    expect(bodyParam?.required).toBe(false);
  });

  it("라인 번호 추출", () => {
    const endpoints = extractEndpoints(BASIC_CONTROLLER);
    for (const ep of endpoints) {
      expect(ep.lineNumber).toBeGreaterThan(0);
    }
  });
});

// ── Full Controller Parsing ─────────────────────────────────────

describe("parseSpringController", () => {
  it("기본 컨트롤러 전체 파싱", () => {
    const ctrl = parseSpringController(BASIC_CONTROLLER, "ChargeController.java");
    expect(ctrl).not.toBeNull();
    expect(ctrl?.className).toBe("ChargeController");
    expect(ctrl?.packageName).toBe("com.onnuripay.api.controller");
    expect(ctrl?.basePath).toBe("/onnuripay/v1.0/charge");
    expect(ctrl?.endpoints).toHaveLength(3);
    expect(ctrl?.sourceFile).toBe("ChargeController.java");
  });

  it("Swagger @Api 태그 추출", () => {
    const ctrl = parseSpringController(SWAGGER_CONTROLLER, "MemberController.java");
    expect(ctrl).not.toBeNull();
    expect(ctrl?.swaggerTag).toBe("회원 관리");
  });

  it("Swagger @ApiOperation summary 추출", () => {
    const ctrl = parseSpringController(SWAGGER_CONTROLLER, "MemberController.java");
    const join = ctrl?.endpoints.find((e) => e.methodName === "joinMember");
    expect(join?.swaggerSummary).toBe("회원 가입");

    const get = ctrl?.endpoints.find((e) => e.methodName === "getMember");
    expect(get?.swaggerSummary).toBe("회원 조회");
  });

  it("컨트롤러 아닌 클래스는 null 반환", () => {
    const result = parseSpringController(NOT_A_CONTROLLER, "DateUtils.java");
    expect(result).toBeNull();
  });

  it("GiftController — @RequestMapping method 속성", () => {
    const ctrl = parseSpringController(REQUEST_MAPPING_WITH_METHOD, "GiftController.java");
    expect(ctrl?.className).toBe("GiftController");
    expect(ctrl?.basePath).toBe("/api/v1/gift");
    expect(ctrl?.endpoints).toHaveLength(3);
  });
});

// ── Service Class Parsing ───────────────────────────────────────

describe("parseServiceClass", () => {
  it("서비스 클래스 메서드 파싱", () => {
    const methods = parseServiceClass(SERVICE_CLASS, "ChargeService.java");
    expect(methods.length).toBeGreaterThanOrEqual(2);
    expect(methods[0]?.className).toBe("ChargeService");
    expect(methods[0]?.sourceFile).toBe("ChargeService.java");
  });

  it("@Transactional 감지", () => {
    const methods = parseServiceClass(SERVICE_CLASS, "ChargeService.java");
    const create = methods.find((m) => m.methodName === "create");
    expect(create?.isTransactional).toBe(true);
  });

  it("Mapper 호출 체인 추출", () => {
    const methods = parseServiceClass(SERVICE_CLASS, "ChargeService.java");
    const create = methods.find((m) => m.methodName === "create");
    expect(create?.calledMappers).toContain("accountDao.debitAccount");
    expect(create?.calledMappers).toContain("chargeMapper.insertCharge");
  });

  it("컨트롤러에서는 빈 배열 반환", () => {
    const methods = parseServiceClass(BASIC_CONTROLLER, "Controller.java");
    expect(methods).toHaveLength(0);
  });
});
