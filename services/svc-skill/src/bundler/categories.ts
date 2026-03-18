/**
 * Skill bundle category definitions for policy classification.
 * Each category groups related policies by business domain.
 */
export const SKILL_CATEGORIES = {
  charging: {
    id: "charging",
    label: "충전 관리",
    keywords: ["충전", "자동충전", "납입", "금액 설정", "충전한도", "충전수단"],
  },
  payment: {
    id: "payment",
    label: "결제 처리",
    keywords: ["결제", "PG", "카드", "가맹점", "수납", "승인", "취소"],
  },
  member: {
    id: "member",
    label: "회원 관리",
    keywords: ["회원가입", "로그인", "인증", "본인확인", "탈퇴", "회원정보"],
  },
  account: {
    id: "account",
    label: "계좌/지갑",
    keywords: ["계좌", "잔액", "이체", "송금", "지갑", "개설"],
  },
  gift: {
    id: "gift",
    label: "상품권 관리",
    keywords: ["발행", "교환", "환불", "유효기간", "상품권", "권종"],
  },
  notification: {
    id: "notification",
    label: "알림/메시지",
    keywords: ["SMS", "푸시", "이메일", "알림", "메시지", "발송"],
  },
  security: {
    id: "security",
    label: "보안/감사",
    keywords: ["접근제어", "암호화", "감사", "로그", "권한", "보안"],
  },
  operation: {
    id: "operation",
    label: "운영 관리",
    keywords: ["배치", "모니터링", "시스템", "설정", "관리자", "운영"],
  },
  settlement: {
    id: "settlement",
    label: "정산/수수료",
    keywords: ["정산", "수수료", "매출", "대사", "입금", "출금"],
  },
  integration: {
    id: "integration",
    label: "API/연동",
    keywords: ["외부", "API", "연동", "오류", "응답", "인터페이스"],
  },
  withdrawal: {
    id: "withdrawal",
    label: "인출/지급",
    keywords: ["중도인출", "지급", "환급", "인출", "해지", "이전", "청구", "수급"],
  },
  tax: {
    id: "tax",
    label: "세금/공제",
    keywords: ["세금", "세액공제", "과세", "원천징수", "퇴직소득", "연말정산", "비과세"],
  },
  product: {
    id: "product",
    label: "상품 관리",
    keywords: ["상품", "원리금보장", "수익증권", "펀드", "상품코드", "운용", "수익률"],
  },
  other: {
    id: "other",
    label: "기타",
    keywords: [],
  },
} as const;

export type SkillCategory = keyof typeof SKILL_CATEGORIES;

export const CATEGORY_IDS = Object.keys(SKILL_CATEGORIES) as SkillCategory[];
