import { describe, test, expect } from "vitest";
import { isMyBatisMapper, parseMyBatisMapper } from "../parsing/mybatis-mapper.js";

const FULL_MAPPER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.kt.onnuripay.common.mapper.CommonMapper">
  <resultMap id="balanceMap" type="com.kt.onnuripay.common.vo.BalanceVO">
    <id column="account_no" property="accountNo" jdbcType="VARCHAR"/>
    <result column="balance_amt" property="balanceAmt" jdbcType="DECIMAL"/>
    <result column="last_updated" property="lastUpdated" jdbcType="TIMESTAMP"/>
  </resultMap>
  <select id="selectBalance" resultMap="balanceMap" parameterType="java.lang.String">
    SELECT account_no, balance_amt, last_updated
    FROM account_balance
    WHERE account_no = #{accountNo}
  </select>
  <insert id="insertBalance" parameterType="com.kt.onnuripay.common.vo.BalanceVO">
    INSERT INTO account_balance (account_no, balance_amt, last_updated)
    VALUES (#{accountNo}, #{balanceAmt}, #{lastUpdated})
  </insert>
</mapper>`;

describe("isMyBatisMapper", () => {
  test("detects DTD declaration", () => {
    const content = `<?xml version="1.0"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.Mapper"></mapper>`;
    expect(isMyBatisMapper(content)).toBe(true);
  });

  test("detects mapper+namespace without DTD", () => {
    const content = `<mapper namespace="com.example.Mapper">
  <select id="find">SELECT 1</select>
</mapper>`;
    expect(isMyBatisMapper(content)).toBe(true);
  });

  test("returns false for mybatis-config.xml content", () => {
    const content = `<?xml version="1.0"?>
<!DOCTYPE configuration PUBLIC "-//mybatis.org//DTD Config 3.0//EN" "http://mybatis.org/dtd/mybatis-3-config.dtd">
<configuration>
  <environments default="dev">
    <environment id="dev">
      <dataSource type="POOLED">
        <property name="driver" value="com.mysql.jdbc.Driver"/>
      </dataSource>
    </environment>
  </environments>
</configuration>`;
    expect(isMyBatisMapper(content)).toBe(false);
  });

  test("returns false for random text", () => {
    expect(isMyBatisMapper("hello world")).toBe(false);
    expect(isMyBatisMapper("public class Foo {}")).toBe(false);
  });
});

describe("parseMyBatisMapper", () => {
  test("extracts namespace and mapperName", () => {
    const result = parseMyBatisMapper(FULL_MAPPER_XML, "CommonMapper.xml");
    expect(result).not.toBeNull();
    expect(result!.namespace).toBe("com.kt.onnuripay.common.mapper.CommonMapper");
    expect(result!.mapperName).toBe("CommonMapper");
    expect(result!.sourceFile).toBe("CommonMapper.xml");
  });

  test("parses resultMap with id/result columns (isPrimaryKey check)", () => {
    const result = parseMyBatisMapper(FULL_MAPPER_XML, "CommonMapper.xml");
    expect(result).not.toBeNull();
    expect(result!.resultMaps).toHaveLength(1);

    const rm = result!.resultMaps[0]!;
    expect(rm.id).toBe("balanceMap");
    expect(rm.type).toBe("com.kt.onnuripay.common.vo.BalanceVO");
    expect(rm.typeName).toBe("BalanceVO");
    expect(rm.columns).toHaveLength(3);

    const pkCol = rm.columns.find((c) => c.column === "account_no");
    expect(pkCol).toBeDefined();
    expect(pkCol!.isPrimaryKey).toBe(true);
    expect(pkCol!.property).toBe("accountNo");
    expect(pkCol!.jdbcType).toBe("VARCHAR");

    const nonPkCol = rm.columns.find((c) => c.column === "balance_amt");
    expect(nonPkCol).toBeDefined();
    expect(nonPkCol!.isPrimaryKey).toBe(false);
  });

  test("SELECT query extracts FROM table and column names", () => {
    const result = parseMyBatisMapper(FULL_MAPPER_XML, "CommonMapper.xml");
    expect(result).not.toBeNull();

    const selectQ = result!.queries.find((q) => q.id === "selectBalance");
    expect(selectQ).toBeDefined();
    expect(selectQ!.queryType).toBe("select");
    expect(selectQ!.tables).toContain("account_balance");
    expect(selectQ!.resultMapRef).toBe("balanceMap");
    expect(selectQ!.parameterType).toBe("java.lang.String");
    expect(selectQ!.columnNames).toContain("account_no");
    expect(selectQ!.columnNames).toContain("balance_amt");
    expect(selectQ!.columnNames).toContain("last_updated");
  });

  test("INSERT query extracts INTO table and column names", () => {
    const result = parseMyBatisMapper(FULL_MAPPER_XML, "CommonMapper.xml");
    expect(result).not.toBeNull();

    const insertQ = result!.queries.find((q) => q.id === "insertBalance");
    expect(insertQ).toBeDefined();
    expect(insertQ!.queryType).toBe("insert");
    expect(insertQ!.tables).toContain("account_balance");
    expect(insertQ!.columnNames).toContain("account_no");
    expect(insertQ!.columnNames).toContain("balance_amt");
    expect(insertQ!.columnNames).toContain("last_updated");
  });

  test("SELECT with JOIN extracts multiple tables", () => {
    const xml = `<mapper namespace="com.example.OrderMapper">
  <select id="selectOrderWithUser" resultType="map">
    SELECT o.order_id, o.total, u.name
    FROM orders o
    JOIN users u ON o.user_id = u.user_id
    WHERE o.order_id = #{orderId}
  </select>
</mapper>`;
    const result = parseMyBatisMapper(xml, "OrderMapper.xml");
    expect(result).not.toBeNull();

    const q = result!.queries[0]!;
    expect(q.tables).toContain("orders");
    expect(q.tables).toContain("users");
    expect(result!.tables).toContain("orders");
    expect(result!.tables).toContain("users");
  });

  test("UPDATE and DELETE table extraction", () => {
    const xml = `<mapper namespace="com.example.UserMapper">
  <update id="updateUserName" parameterType="map">
    UPDATE users SET name = #{name} WHERE user_id = #{userId}
  </update>
  <delete id="deleteUser" parameterType="java.lang.Long">
    DELETE FROM users WHERE user_id = #{userId}
  </delete>
</mapper>`;
    const result = parseMyBatisMapper(xml, "UserMapper.xml");
    expect(result).not.toBeNull();
    expect(result!.queries).toHaveLength(2);

    const updateQ = result!.queries.find((q) => q.id === "updateUserName");
    expect(updateQ!.queryType).toBe("update");
    expect(updateQ!.tables).toContain("users");

    const deleteQ = result!.queries.find((q) => q.id === "deleteUser");
    expect(deleteQ!.queryType).toBe("delete");
    expect(deleteQ!.tables).toContain("users");

    expect(result!.tables).toContain("users");
  });

  test("dynamic SQL (if/foreach) inner content still parsed", () => {
    const xml = `<mapper namespace="com.example.SearchMapper">
  <select id="searchProducts" resultType="map">
    SELECT product_id, product_name
    FROM products
    <where>
      <if test="name != null">
        AND product_name LIKE #{name}
      </if>
      <if test="ids != null">
        AND product_id IN
        <foreach collection="ids" item="id" open="(" separator="," close=")">
          #{id}
        </foreach>
      </if>
    </where>
  </select>
</mapper>`;
    const result = parseMyBatisMapper(xml, "SearchMapper.xml");
    expect(result).not.toBeNull();

    const q = result!.queries[0]!;
    expect(q.tables).toContain("products");
    expect(q.columnNames).toContain("product_id");
    expect(q.columnNames).toContain("product_name");
  });

  test("CDATA wrapped SQL parsed correctly", () => {
    const xml = `<mapper namespace="com.example.ReportMapper">
  <select id="selectReport" resultType="map">
    <![CDATA[
    SELECT report_id, amount
    FROM reports
    WHERE amount > 0
    ]]>
  </select>
</mapper>`;
    const result = parseMyBatisMapper(xml, "ReportMapper.xml");
    expect(result).not.toBeNull();

    const q = result!.queries[0]!;
    expect(q.tables).toContain("reports");
    expect(q.columnNames).toContain("report_id");
    expect(q.columnNames).toContain("amount");
  });

  test("returns null when no namespace found", () => {
    const xml = `<mapper>
  <select id="findAll">SELECT * FROM items</select>
</mapper>`;
    const result = parseMyBatisMapper(xml, "broken.xml");
    expect(result).toBeNull();
  });

  test("collects all unique tables from all queries", () => {
    const xml = `<mapper namespace="com.example.MultiMapper">
  <select id="q1" resultType="map">SELECT a FROM tableA</select>
  <select id="q2" resultType="map">SELECT b FROM tableB JOIN tableC ON tableB.id = tableC.id</select>
  <insert id="q3">INSERT INTO tableA (a) VALUES (#{a})</insert>
</mapper>`;
    const result = parseMyBatisMapper(xml, "MultiMapper.xml");
    expect(result).not.toBeNull();
    expect(result!.tables).toContain("tableA");
    expect(result!.tables).toContain("tableB");
    expect(result!.tables).toContain("tableC");
    // Unique — tableA from both q1 and q3 should appear only once
    const tableACount = result!.tables.filter((t) => t === "tableA").length;
    expect(tableACount).toBe(1);
  });

  test("resultMap javaType attribute extraction", () => {
    const xml = `<mapper namespace="com.example.TypeMapper">
  <resultMap id="detailMap" type="com.example.DetailVO">
    <id column="detail_id" property="detailId" javaType="java.lang.Long" jdbcType="BIGINT"/>
    <result column="description" property="description"/>
  </resultMap>
</mapper>`;
    const result = parseMyBatisMapper(xml, "TypeMapper.xml");
    expect(result).not.toBeNull();

    const rm = result!.resultMaps[0]!;
    const pkCol = rm.columns.find((c) => c.column === "detail_id");
    expect(pkCol!.javaType).toBe("java.lang.Long");
    expect(pkCol!.jdbcType).toBe("BIGINT");

    const descCol = rm.columns.find((c) => c.column === "description");
    expect(descCol!.javaType).toBeUndefined();
    expect(descCol!.jdbcType).toBeUndefined();
  });
});
