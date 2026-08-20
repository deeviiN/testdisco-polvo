import { describe, it, expect } from "vitest";
import { buildForwardRows, parseAttachment } from "../DirectMessage";

const ctx = {
  school_id: "school-1",
  sender_id: "user-A",
  sender_name: "Prof. A",
  recipient_id: "user-B",
};

const mkMsg = (id: string, content: string, created_at = "2025-01-01T00:00:00Z") => ({
  id,
  content,
  created_at,
});

describe("DirectMessage forward preserves attachments", () => {
  it("mantém o marcador [anexo] de uma foto ao encaminhar", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/x.png)(foto.png)\nveja a foto"),
    ];
    const rows = buildForwardRows(msgs, ["m1"], ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe(msgs[0].content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("https://cdn.example.com/x.png");
    expect(att!.name).toBe("foto.png");
    expect(att!.rest).toBe("veja a foto");
  });

  it("mantém o marcador [anexo] de um vídeo ao encaminhar", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/v.mp4)(aula.mp4)"),
    ];
    const rows = buildForwardRows(msgs, ["m1"], ctx);
    const att = parseAttachment(rows[0].content);
    expect(att?.name).toBe("aula.mp4");
    expect(att?.url).toBe("https://cdn.example.com/v.mp4");
  });

  it("mantém o marcador [anexo] de um PDF ao encaminhar", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/doc.pdf)(plano.pdf)\nsegue o plano"),
    ];
    const rows = buildForwardRows(msgs, ["m1"], ctx);
    const att = parseAttachment(rows[0].content);
    expect(att?.name).toBe("plano.pdf");
    expect(att?.rest).toBe("segue o plano");
  });

  it("encaminha múltiplas mensagens preservando anexos e ordem cronológica", () => {
    const msgs = [
      mkMsg("m2", "[anexo](https://cdn.example.com/b.pdf)(b.pdf)", "2025-01-02T00:00:00Z"),
      mkMsg("m1", "[anexo](https://cdn.example.com/a.png)(a.png)", "2025-01-01T00:00:00Z"),
      mkMsg("m3", "texto puro sem anexo", "2025-01-03T00:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);
    expect(rows.map((r) => r.content)).toEqual([
      "[anexo](https://cdn.example.com/a.png)(a.png)",
      "[anexo](https://cdn.example.com/b.pdf)(b.pdf)",
      "texto puro sem anexo",
    ]);
    expect(parseAttachment(rows[0].content)?.name).toBe("a.png");
    expect(parseAttachment(rows[1].content)?.name).toBe("b.pdf");
    expect(parseAttachment(rows[2].content)).toBeNull();
  });

  it("preenche corretamente os metadados do destinatário", () => {
    const msgs = [mkMsg("m1", "[anexo](https://cdn.example.com/x.png)(x.png)")];
    const [row] = buildForwardRows(msgs, ["m1"], ctx);
    expect(row.school_id).toBe("school-1");
    expect(row.sender_id).toBe("user-A");
    expect(row.sender_name).toBe("Prof. A");
    expect(row.recipient_id).toBe("user-B");
  });
});

describe("DirectMessage forward preserves plain text (sem anexo)", () => {
  it("encaminha texto puro sem alterar o conteúdo", () => {
    const msgs = [mkMsg("m1", "Olá, tudo bem?")];
    const rows = buildForwardRows(msgs, ["m1"], ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("Olá, tudo bem?");
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("preserva quebras de linha e caracteres especiais", () => {
    const content = "Linha 1\nLinha 2\n• item — com acento ✓\n(parênteses) [colchetes]";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("não confunde texto que apenas menciona '[anexo]' com um anexo real", () => {
    const content = "Vou te enviar o [anexo] depois";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("encaminha múltiplas mensagens de texto puro mantendo ordem cronológica", () => {
    const msgs = [
      mkMsg("m2", "segunda", "2025-01-02T00:00:00Z"),
      mkMsg("m1", "primeira", "2025-01-01T00:00:00Z"),
      mkMsg("m3", "terceira", "2025-01-03T00:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);
    expect(rows.map((r) => r.content)).toEqual(["primeira", "segunda", "terceira"]);
    expect(rows.every((r) => parseAttachment(r.content) === null)).toBe(true);
  });

  it("não retorna nenhuma linha quando nenhum id de texto foi selecionado", () => {
    const msgs = [mkMsg("m1", "texto 1"), mkMsg("m2", "texto 2")];
    const rows = buildForwardRows(msgs, [], ctx);
    expect(rows).toEqual([]);
  });
});

describe("DirectMessage forward de mensagens mistas (com e sem [anexo])", () => {
  it("preserva conteúdo de texto puro e mantém anexos funcionando ao encaminhar em lote", () => {
    const msgs = [
      mkMsg("m1", "bom dia turma", "2025-01-01T08:00:00Z"),
      mkMsg("m2", "[anexo](https://cdn.example.com/foto.png)(foto.png)", "2025-01-01T09:00:00Z"),
      mkMsg("m3", "segue resumo\ncom quebra de linha", "2025-01-01T10:00:00Z"),
      mkMsg("m4", "[anexo](https://cdn.example.com/aula.mp4)(aula.mp4)\nassistam até o fim", "2025-01-01T11:00:00Z"),
      mkMsg("m5", "menção ao [anexo] sem ser anexo real", "2025-01-01T12:00:00Z"),
      mkMsg("m6", "[anexo](https://cdn.example.com/plano.pdf)(plano.pdf)", "2025-01-01T13:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3", "m4", "m5", "m6"], ctx);

    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.content)).toEqual([
      "bom dia turma",
      "[anexo](https://cdn.example.com/foto.png)(foto.png)",
      "segue resumo\ncom quebra de linha",
      "[anexo](https://cdn.example.com/aula.mp4)(aula.mp4)\nassistam até o fim",
      "menção ao [anexo] sem ser anexo real",
      "[anexo](https://cdn.example.com/plano.pdf)(plano.pdf)",
    ]);

    // Texto puro permanece intacto e sem ser interpretado como anexo
    expect(parseAttachment(rows[0].content)).toBeNull();
    expect(parseAttachment(rows[2].content)).toBeNull();
    expect(parseAttachment(rows[4].content)).toBeNull();

    // Linhas com anexo continuam funcionando
    const foto = parseAttachment(rows[1].content);
    expect(foto?.url).toBe("https://cdn.example.com/foto.png");
    expect(foto?.name).toBe("foto.png");

    const video = parseAttachment(rows[3].content);
    expect(video?.url).toBe("https://cdn.example.com/aula.mp4");
    expect(video?.name).toBe("aula.mp4");
    expect(video?.rest).toBe("assistam até o fim");

    const pdf = parseAttachment(rows[5].content);
    expect(pdf?.url).toBe("https://cdn.example.com/plano.pdf");
    expect(pdf?.name).toBe("plano.pdf");
  });
});

describe("DirectMessage forward com marcadores [anexo] malformados", () => {
  it("trata marcadores malformados como texto puro e não quebra o lote", () => {
    const malformed = [
      "[anexo]https://cdn.example.com/x.png(x.png)",      // sem parênteses na url
      "[anexo](https://cdn.example.com/x.png)",            // faltando o segundo grupo (nome)
      "[anexo](https://cdn.example.com/x.png)(semext)",   // nome sem extensão (formato ok mas sem ext)
      "[anexo]()()",                                       // grupos vazios
      "[anexo] (https://cdn.example.com/x.png)(x.png)",   // espaço entre prefixo e url
      "anexo](https://cdn.example.com/x.png)(x.png)",     // sem o colchete de abertura
    ];
    const msgs = [
      mkMsg("m1", malformed[0], "2025-01-01T01:00:00Z"),
      mkMsg("m2", "[anexo](https://cdn.example.com/ok.png)(ok.png)", "2025-01-01T02:00:00Z"),
      mkMsg("m3", malformed[1], "2025-01-01T03:00:00Z"),
      mkMsg("m4", malformed[2], "2025-01-01T04:00:00Z"),
      mkMsg("m5", malformed[3], "2025-01-01T05:00:00Z"),
      mkMsg("m6", malformed[4], "2025-01-01T06:00:00Z"),
      mkMsg("m7", malformed[5], "2025-01-01T07:00:00Z"),
    ];
    const ids = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];

    // Não deve lançar e deve retornar todas as linhas
    const rows = buildForwardRows(msgs, ids, ctx);
    expect(rows).toHaveLength(7);

    // Conteúdo preservado byte-a-byte
    expect(rows.map((r) => r.content)).toEqual([
      malformed[0],
      "[anexo](https://cdn.example.com/ok.png)(ok.png)",
      malformed[1],
      malformed[2],
      malformed[3],
      malformed[4],
      malformed[5],
    ]);

    // Marcadores malformados que não casam o regex => null (tratados como texto)
    expect(parseAttachment(rows[0].content)).toBeNull(); // sem parênteses na url
    expect(parseAttachment(rows[2].content)).toBeNull(); // faltando segundo grupo
    expect(parseAttachment(rows[5].content)).toBeNull(); // espaço quebra o prefixo
    expect(parseAttachment(rows[6].content)).toBeNull(); // sem colchete de abertura

    // Anexo válido continua funcionando no mesmo lote
    const ok = parseAttachment(rows[1].content);
    expect(ok?.url).toBe("https://cdn.example.com/ok.png");
    expect(ok?.name).toBe("ok.png");
  });
});

describe("DirectMessage forward com múltiplos marcadores [anexo] no mesmo texto", () => {
  it("encaminha mantendo conteúdo intacto e parseia o primeiro anexo, com restante preservado em rest", () => {
    const conteudoMulti =
      "[anexo](https://cdn.example.com/a.png)(a.png)\n" +
      "veja também:\n" +
      "[anexo](https://cdn.example.com/b.pdf)(b.pdf)\n" +
      "[anexo](https://cdn.example.com/c.mp4)(c.mp4)";

    const msgs = [
      mkMsg("m2", "mensagem do meio", "2025-02-01T02:00:00Z"),
      mkMsg("m1", conteudoMulti, "2025-02-01T01:00:00Z"),
      mkMsg("m3", "[anexo](https://cdn.example.com/z.png)(z.png)", "2025-02-01T03:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);

    // Ordem cronológica preservada e conteúdo byte-a-byte intacto
    expect(rows.map((r) => r.content)).toEqual([
      conteudoMulti,
      "mensagem do meio",
      "[anexo](https://cdn.example.com/z.png)(z.png)",
    ]);

    // O primeiro marcador é parseado; os demais permanecem em `rest`
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("https://cdn.example.com/a.png");
    expect(att!.name).toBe("a.png");
    expect(att!.rest).toBe(
      "veja também:\n" +
      "[anexo](https://cdn.example.com/b.pdf)(b.pdf)\n" +
      "[anexo](https://cdn.example.com/c.mp4)(c.mp4)"
    );

    // Anexo válido subsequente do lote continua funcionando
    const z = parseAttachment(rows[2].content);
    expect(z?.url).toBe("https://cdn.example.com/z.png");
    expect(z?.name).toBe("z.png");
  });
});

describe("DirectMessage forward com espaçamento e quebras de linha dentro do marcador [anexo]", () => {
  it("trata quebra de linha após o prefixo [anexo] como texto (malformado)", () => {
    const content = "[anexo]\n(https://cdn.example.com/x.png)(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("trata quebra de linha entre URL e nome como texto (malformado)", () => {
    const content = "[anexo](https://cdn.example.com/x.png)\n(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("preserva múltiplas quebras de linha após o marcador válido em rest", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\n\n\nveja";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("https://cdn.example.com/x.png");
    expect(att!.name).toBe("x.png");
    expect(att!.rest).toBe("\n\nveja");
  });

  it("trata espaço entre prefixo e parêntese como texto (malformado)", () => {
    const content = "[anexo] (https://cdn.example.com/x.png)(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("trata tabulação dentro dos parênteses como parte do valor (parser aceita, conteúdo preservado)", () => {
    const content = "[anexo](\thttps://cdn.example.com/x.png\t)(\tx.png\t)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("\thttps://cdn.example.com/x.png\t");
    expect(att!.name).toBe("\tx.png\t");
  });

  it("trata quebra de linha dentro da URL como texto (malformado)", () => {
    const content = "[anexo](https://cdn.example.com/x\n.png)(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("trata prefixo [anexo] com quebra no meio como texto (malformado)", () => {
    const content = "[an\nexo](https://cdn.example.com/x.png)(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("não quebra o lote quando mistura válidos e inválidos com quebras de linha", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/a.png)(a.png)", "2025-01-01T01:00:00Z"),
      mkMsg("m2", "[anexo]\n(https://cdn.example.com/b.png)(b.png)", "2025-01-01T02:00:00Z"),
      mkMsg("m3", "[anexo](https://cdn.example.com/c.png)(c.png)\n\nresto", "2025-01-01T03:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);
    expect(rows.map((r) => r.content)).toEqual([
      "[anexo](https://cdn.example.com/a.png)(a.png)",
      "[anexo]\n(https://cdn.example.com/b.png)(b.png)",
      "[anexo](https://cdn.example.com/c.png)(c.png)\n\nresto",
    ]);
    expect(parseAttachment(rows[0].content)).not.toBeNull();
    expect(parseAttachment(rows[1].content)).toBeNull();
    const att = parseAttachment(rows[2].content);
    expect(att).not.toBeNull();
    expect(att!.rest).toBe("\nresto");
  });
});

describe("DirectMessage forward com quebras de linha Windows \\r\\n no marcador [anexo]", () => {
  it("trata \\r\\n após o prefixo [anexo] como texto (malformado)", () => {
    const content = "[anexo]\r\n(https://cdn.example.com/x.png)(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("trata \\r\\n entre URL e nome como texto (malformado)", () => {
    const content = "[anexo](https://cdn.example.com/x.png)\r\n(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("preserva \\r\\n no rest após marcador válido", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\r\n\r\nveja";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("https://cdn.example.com/x.png");
    expect(att!.name).toBe("x.png");
    expect(att!.rest).toBe("\r\nveja");
  });

  it("não quebra o lote quando mistura válidos e inválidos com \\r\\n", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/a.png)(a.png)", "2025-01-01T01:00:00Z"),
      mkMsg("m2", "[anexo]\r\n(https://cdn.example.com/b.png)(b.png)", "2025-01-01T02:00:00Z"),
      mkMsg("m3", "[anexo](https://cdn.example.com/c.png)(c.png)\r\n\r\nresto", "2025-01-01T03:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);
    expect(rows.map((r) => r.content)).toEqual([
      "[anexo](https://cdn.example.com/a.png)(a.png)",
      "[anexo]\r\n(https://cdn.example.com/b.png)(b.png)",
      "[anexo](https://cdn.example.com/c.png)(c.png)\r\n\r\nresto",
    ]);
    expect(parseAttachment(rows[0].content)).not.toBeNull();
    expect(parseAttachment(rows[1].content)).toBeNull();
    const att = parseAttachment(rows[2].content);
    expect(att).not.toBeNull();
    expect(att!.rest).toBe("\r\nresto");
  });
});

describe("DirectMessage forward com quebras de linha apenas \\r (sem \\n) no marcador [anexo]", () => {
  it("trata \\r após o prefixo [anexo] como texto (malformado)", () => {
    const content = "[anexo]\r(https://cdn.example.com/x.png)(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("trata \\r entre URL e nome como texto (malformado)", () => {
    const content = "[anexo](https://cdn.example.com/x.png)\r(x.png)";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    expect(parseAttachment(rows[0].content)).toBeNull();
  });

  it("preserva \\r no rest após marcador válido", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\r\rveja";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("https://cdn.example.com/x.png");
    expect(att!.name).toBe("x.png");
    expect(att!.rest).toBe("\rveja");
  });

  it("não quebra o lote quando mistura válidos e inválidos com \\r", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/a.png)(a.png)", "2025-01-01T01:00:00Z"),
      mkMsg("m2", "[anexo]\r(https://cdn.example.com/b.png)(b.png)", "2025-01-01T02:00:00Z"),
      mkMsg("m3", "[anexo](https://cdn.example.com/c.png)(c.png)\r\rresto", "2025-01-01T03:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);
    expect(rows.map((r) => r.content)).toEqual([
      "[anexo](https://cdn.example.com/a.png)(a.png)",
      "[anexo]\r(https://cdn.example.com/b.png)(b.png)",
      "[anexo](https://cdn.example.com/c.png)(c.png)\r\rresto",
    ]);
    expect(parseAttachment(rows[0].content)).not.toBeNull();
    expect(parseAttachment(rows[1].content)).toBeNull();
    const att = parseAttachment(rows[2].content);
    expect(att).not.toBeNull();
    expect(att!.rest).toBe("\rresto");
  });
});

describe("DirectMessage forward com [anexo] terminando em \\r\\n (rest vazio ou espaços)", () => {
  it("retorna rest vazio quando marcador termina com \\r\\n sem conteúdo", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\r\n";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("https://cdn.example.com/x.png");
    expect(att!.name).toBe("x.png");
    expect(att!.rest).toBe("");
  });

  it("retorna rest com espaços quando marcador termina com \\r\\n + espaços", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\r\n   ";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.rest).toBe("   ");
  });

  it("retorna rest com tabs e espaços quando marcador termina com \\r\\n + mix", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\r\n\t  \t";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.rest).toBe("\t  \t");
  });

  it("não quebra o lote com múltiplas mensagens terminando em \\r\\n com rest vazio", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/a.png)(a.png)\r\n", "2025-01-01T01:00:00Z"),
      mkMsg("m2", "[anexo](https://cdn.example.com/b.png)(b.png)\r\n   ", "2025-01-01T02:00:00Z"),
      mkMsg("m3", "texto puro", "2025-01-01T03:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);
    expect(rows.map((r) => r.content)).toEqual([
      "[anexo](https://cdn.example.com/a.png)(a.png)\r\n",
      "[anexo](https://cdn.example.com/b.png)(b.png)\r\n   ",
      "texto puro",
    ]);
    const a = parseAttachment(rows[0].content);
    expect(a).not.toBeNull();
    expect(a!.rest).toBe("");
    const b = parseAttachment(rows[1].content);
    expect(b).not.toBeNull();
    expect(b!.rest).toBe("   ");
    expect(parseAttachment(rows[2].content)).toBeNull();
  });
});

describe("DirectMessage forward com [anexo] terminando em \\n (rest vazio ou espaços)", () => {
  it("retorna rest vazio quando marcador termina com \\n sem conteúdo", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\n";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.url).toBe("https://cdn.example.com/x.png");
    expect(att!.name).toBe("x.png");
    expect(att!.rest).toBe("");
  });

  it("retorna rest com espaços quando marcador termina com \\n + espaços", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\n  ";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.rest).toBe("  ");
  });

  it("retorna rest com tabs e espaços quando marcador termina com \\n + mix", () => {
    const content = "[anexo](https://cdn.example.com/x.png)(x.png)\n\t  \t";
    const rows = buildForwardRows([mkMsg("m1", content)], ["m1"], ctx);
    expect(rows[0].content).toBe(content);
    const att = parseAttachment(rows[0].content);
    expect(att).not.toBeNull();
    expect(att!.rest).toBe("\t  \t");
  });

  it("não quebra o lote com múltiplas mensagens terminando em \\n com rest vazio", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/a.png)(a.png)\n", "2025-01-01T01:00:00Z"),
      mkMsg("m2", "[anexo](https://cdn.example.com/b.png)(b.png)\n  ", "2025-01-01T02:00:00Z"),
      mkMsg("m3", "texto puro", "2025-01-01T03:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3"], ctx);
    expect(rows.map((r) => r.content)).toEqual([
      "[anexo](https://cdn.example.com/a.png)(a.png)\n",
      "[anexo](https://cdn.example.com/b.png)(b.png)\n  ",
      "texto puro",
    ]);
    const a = parseAttachment(rows[0].content);
    expect(a).not.toBeNull();
    expect(a!.rest).toBe("");
    const b = parseAttachment(rows[1].content);
    expect(b).not.toBeNull();
    expect(b!.rest).toBe("  ");
    expect(parseAttachment(rows[2].content)).toBeNull();
  });
});

describe("DirectMessage forward com [anexo] malformados (parênteses faltando)", () => {
  const cases: Array<{ label: string; content: string }> = [
    { label: "faltando ) da url", content: "[anexo](https://cdn.example.com/x.png(x.png)" },
    { label: "faltando ( da url", content: "[anexo]https://cdn.example.com/x.png)(x.png)" },
    { label: "faltando ) do name", content: "[anexo](https://cdn.example.com/x.png)(x.png" },
    { label: "faltando ( do name", content: "[anexo](https://cdn.example.com/x.png)x.png)" },
    { label: "faltando ambos os parênteses do name", content: "[anexo](https://cdn.example.com/x.png)x.png" },
    { label: "faltando ambos os parênteses da url", content: "[anexo]https://cdn.example.com/x.png(x.png)" },
    { label: "url e name sem nenhum parêntese", content: "[anexo]https://cdn.example.com/x.png x.png" },
    { label: "apenas prefixo [anexo]", content: "[anexo]" },
  ];

  for (const c of cases) {
    it(`retorna null e preserva o texto quando ${c.label}`, () => {
      const rows = buildForwardRows([mkMsg("m1", c.content)], ["m1"], ctx);
      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe(c.content);
      expect(parseAttachment(rows[0].content)).toBeNull();
    });
  }

  it("não quebra o lote misturando malformados (parênteses faltando) com válidos", () => {
    const msgs = [
      mkMsg("m1", "[anexo](https://cdn.example.com/a.png(a.png)", "2025-03-01T01:00:00Z"),
      mkMsg("m2", "[anexo](https://cdn.example.com/ok.png)(ok.png)", "2025-03-01T02:00:00Z"),
      mkMsg("m3", "[anexo](https://cdn.example.com/b.png)(b.png", "2025-03-01T03:00:00Z"),
      mkMsg("m4", "[anexo]https://cdn.example.com/c.png)(c.png)", "2025-03-01T04:00:00Z"),
    ];
    const rows = buildForwardRows(msgs, ["m1", "m2", "m3", "m4"], ctx);
    expect(rows.map((r) => r.content)).toEqual([
      "[anexo](https://cdn.example.com/a.png(a.png)",
      "[anexo](https://cdn.example.com/ok.png)(ok.png)",
      "[anexo](https://cdn.example.com/b.png)(b.png",
      "[anexo]https://cdn.example.com/c.png)(c.png)",
    ]);
    expect(parseAttachment(rows[0].content)).toBeNull();
    const ok = parseAttachment(rows[1].content);
    expect(ok?.url).toBe("https://cdn.example.com/ok.png");
    expect(ok?.name).toBe("ok.png");
    expect(parseAttachment(rows[2].content)).toBeNull();
    expect(parseAttachment(rows[3].content)).toBeNull();
  });
});
