# MCP サーバー

BookKeeper の MCP サーバーを実装しながら学んだことを、実装の順に残しておく。最初に、設計の判断の要点をまとめる。

## 設計の判断のまとめ

### ツール

| ツール | できること | 種類 |
|---|---|---|
| `ping` | サーバーにつながっているか確かめる | 読み取り |
| `list_tsundoku` | 積読の本を、長く積んでいる順に返す | 読み取り |
| `search_books` | 書名・著者のキーワードと読書状態で本を探す | 読み取り |
| `get_book_detail` | 本 1 冊の書誌情報・読書記録・購入記録をまとめて返す | 読み取り |
| `list_yearly_expenses` | 年ごとの書籍費 | 読み取り |
| `get_year_expenses` | 1 年分の書籍費と、月ごとの内訳 | 読み取り |
| `get_month_expenses` | 1 か月分の書籍費と、購入記録の明細 | 読み取り |
| `update_reading_status` | 読書状態と、読み始めた日・読み終えた日を変える | 書き込み |

### 判断の要点

| 判断 | 理由 | 詳しくは |
|---|---|---|
| 処理はサービス（`app/services/`）に置き、API と MCP の両方から呼ぶ。ツールの関数は薄い窓口にする | ルーターの関数をそのままツールにすると、FastAPI の `session` が AI に見え、API と MCP の説明文が互いに縛り合う | ステップ 3 |
| サーバーはコンテナの中で、stdio で動かす | アプリと同じ環境・同じ DB を使える。ネットワークで待ち受けない | ステップ 2 |
| 説明文・引数・結果の項目の説明を、AI 向けに書く | AI はコードを見ず、説明だけでツールを選び、結果を読む。`#` のコメントは届かない | 説明文の書き方、ステップ 3 |
| 検索は件数に上限（`limit`）を設け、当てはまった数 `total` を一緒に返す | AI が全件を受け取らずに済む。`total` と件数を比べて、残りがあると気づける | ステップ 4-1 |
| 結果のモデルは、API と形が違えば AI 向けに作り、同じなら API のモデルに説明を付けて共有する | 本の詳細は 3 つの記録をまとめた新しい形。書籍費は API と同じ形で、項目の意味も同じ | ステップ 4-2、4-3 |
| 合計などの計算はサーバーで済ませて渡す | AI は数字の計算を間違えることがある | ステップ 4-2 |
| 範囲外の引数は、引数の制約（`ge`・`le`）で関数を実行する前に止める | サービスに届くと予想していない例外になり、AI に理由が届かない | ステップ 4-3 |
| 予想していた失敗は `ToolError` に変え、理由と次の手を AI に返す | SDK は予想していない例外の文を隠すので、AI は立て直せない | ステップ 5 |
| 書き込みは、変えてよい範囲を狭くする（メモは変えない、省いた日付は今のまま） | AI が送り忘れた項目で、ユーザーの記録が消えないようにする | ステップ 7 |
| 書き込みのツールは読書状態の更新だけにし、本の登録・削除や購入記録の追加は画面から行う | 登録には openBD からの取得が要り、ツールが外部に出る（`open_world_hint` が true になる）。AI が書誌情報や金額を間違えて登録すると、気づきにくく直す手間も大きい。表紙や入力欄を見ながら確かめられる画面の方が向いている | ステップ 7 |
| ツールに注釈を付け、許可のルールで書き込みだけ毎回確認する | 読み取りは手軽に、DB を変えるときは利用者が確かめられるようにする | ツールの注釈、ホストの許可 |
| 守りの中心はバックアップにする | MCP の許可は扉の鍵で、壁ではない。シェルを持つ AI は、MCP を通らずに DB を変えられる | MCP の許可は扉の鍵で、壁ではない |

## 学んだこと

### MCP の全体像

MCP（Model Context Protocol）は、AI のアプリが外部のツールやデータを使うための決まり。

登場人物は次の 4 者。

| 登場人物 | 例 | 役割 |
|---|---|---|
| ホスト | Claude Code・Claude Desktop・MCP Inspector | AI を使うアプリ。LLM の決定を受けて、MCP クライアントにツールを実行させ、結果を LLM に渡す |
| LLM | Claude | ツールの一覧を見て、どのツールを・どんな引数で呼ぶかを決める |
| MCP クライアント | ホストの中の部品 | MCP サーバーと通信する |
| MCP サーバー | 今回作るもの | ツールを持ち、呼ばれたら実行して結果を返す。ホストが起動する別のプロセスで動く |

- **LLM は、サーバーのコードを見ていない。** 見ているのは、ツールの名前・説明文・引数の形だけ。それをもとに、どのツールをいつ呼ぶかを決める。そのため、説明文の書き方が設計の中心になる
- MCP サーバーが提供できるものは 3 種類ある。今回使うのは tools
  - tools：AI が呼べる関数
  - resources：AI が読めるデータ
  - prompts：決まった依頼の文面
- つなぎ方は 2 種類ある。今回は stdio を使う
  - stdio：ホストがサーバーを子プロセスとして起動し、標準入出力でやりとりする。自分の PC で使うサーバーでは、こちらが一般的
  - HTTP（Streamable HTTP）：サーバーが Web サーバーとして待ち受け、ホストが URL に接続する

### 通信の流れ

HTTP ではなく標準入出力で、**JSON-RPC** の形でやりとりする。JSON-RPC では、呼ぶ名前（`method`）・引数（`params`）・番号（`id`）を送ると、同じ `id` の付いた結果が返ってくる。1 回送ると 1 回返ってくる点は、HTTP のリクエストとレスポンスに似ている。

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "ping", "arguments": {}}}
```

MCP Inspector で `ping` を呼んで、次の流れを確かめた。

1. **initialize**：つないだ直後に一度だけ行う、お互いの自己紹介
   - クライアントが希望するプロトコルの版を伝え、サーバーが自分も話せる版を答える。版は `2025-06-18` のような日付の形
   - サーバーは、自分の情報（`serverInfo`。`MCPServer("BookKeeper")` で付けた名前が入る）と、できること（`capabilities`）を伝える
   - `capabilities` に `tools` があるので、クライアントは `tools/list` を呼ぶ。できることを最初に宣言しておくので、持っていない機能を問い合わせる無駄がない
2. **tools/list**：ツールの一覧を受け取る。ツールごとに次の項目がある
   - `name`：名前
   - `description`：説明文
   - `inputSchema`：引数の形（JSON Schema）。引数がないツールでも省略されず、`{"type": "object", "properties": {}}` になる。引数は、いつもオブジェクト（名前と値の組）で渡す決まりのため
   - `outputSchema`：戻り値の形（JSON Schema）
3. **tools/call**：ツールを呼び、結果を受け取る。結果（`result`）には次の項目がある
   - `content`：AI が**読む**ための結果。部品（コンテンツブロック）のリストで、`type` で種類（`text`・`image`・`audio` など）を区別する。`ping` の `"pong"` は `content[0].text` にあった
   - `structuredContent`：プログラムが**扱う**ための結果。`outputSchema` に合った JSON。`ping` では `{"result": "pong"}`
   - `isError`：エラーかどうか

`structuredContent` は、JSON Schema の決まりでオブジェクトでなければならない。そのため、文字列や整数を返すツールでは、SDK が `{"result": ...}` と包む。

### 関数がツールになるしくみ

Python の SDK では、関数に `@server.tool()` を付けるだけでツールになる。登録のとき、SDK は次のことをする。

1. Python の `inspect` で、関数の定義（関数名・引数の名前と型ヒント・既定値・docstring・戻り値の型ヒント）を読む
2. 引数から Pydantic のモデル（例：`addArguments`）を、その場で作る
3. そのモデルを JSON Schema に変換して `inputSchema` にする。戻り値の型ヒントからは、同じようにして `outputSchema` を作る

```python
@server.tool()
def add(a: int, b: int = 0) -> int:
    """2つの整数を足す"""
    return a + b
```

| 関数のどこから | ツールのどこへ |
|---|---|
| 関数名 `add` | `name` |
| docstring | `description` |
| 引数の型ヒント `a: int`・`b: int = 0` | `inputSchema` の `properties` |
| 既定値の有無 | `inputSchema` の `required`。既定値のない `a` だけが必須になる |
| 戻り値の型ヒント `-> int` | `outputSchema` |

- **説明文になるのは docstring だけ。** `#` のコメントは Python が実行するときに捨てるので、SDK にも AI にも届かない
- 呼び出されたときは、作ったモデルで引数を検証してから関数を実行する。`a` に `"x"` を渡すと、関数は実行されず、`Input should be a valid integer` というエラーが返った
- これは FastAPI と同じ考え方。FastAPI は、型ヒントからリクエストの検証と API の説明書（OpenAPI）を作る。MCP の SDK は、型ヒントから引数の検証とツールの説明書（AI 向け）を作る

### SDK の版の注意

Python の SDK（`mcp` パッケージ）は、2.x で大きく変わった。ネットの記事の多くは 1.x を前提にしているので、参考にするときは版に気をつける。

| 1.x | 2.x |
|---|---|
| `from mcp.server.fastmcp import FastMCP` | `from mcp.server.mcpserver import MCPServer` |
| 結果の `isError`・`structuredContent` | 結果の `is_error`・`structured_content`（Python の属性名がスネークケースになった。JSON の上では今までどおり `isError`） |

### stdio と標準出力

プログラムには、最初から 3 本の通り道がある。`print` は、何も指定しなければ標準出力に書く。

| 通り道 | 番号 | 向き | 主に使うもの |
|---|---|---|---|
| 標準入力（stdin） | 0 | 外 → プログラム | `input()` |
| 標準出力（stdout） | 1 | プログラム → 外 | `print()` |
| 標準エラー出力（stderr） | 2 | プログラム → 外 | エラーメッセージ、`logging`（既定の設定） |

stdio の MCP サーバーでは、標準入力と標準出力が、ホストとの会話（JSON-RPC）専用の通り道になる。標準エラー出力は会話に使わないので、ログを書いてよい。

```
ホスト ──（JSON-RPC の要求）──→ 0：標準入力 ─→ サーバー
ホスト ←─（JSON-RPC の応答）── 1：標準出力 ←─ サーバー
画面やログ ←───────────────── 2：標準エラー出力 ←─ サーバー
```

`print` を 2 か所に入れて、何が起きるかを確かめた。

| `print` の場所 | 起きたこと |
|---|---|
| ツールの中 | 標準エラー出力に出た。通信には影響しない。SDK 2.x は、`server.run()` の間、標準出力に書かれたものを標準エラー出力へ逃がしている |
| `server.run()` の前 | 通信路（標準出力）に混ざった。Python の SDK のクライアントは「JSON として読めない」というエラーを記録して、その行を捨て、通信を続けた |

- 今回はクライアントが寛容だったが、クライアントによってはつながらなくなりうる。しかも原因が見えにくい
- そのため、MCP サーバーでログを出すときは、`print` ではなく `logging`（標準エラー出力に書く）を使う

### DB のセッション

セッションは、DB とやりとりするための窓口。読むときも書くときも、DB とのやりとりは必ずセッションを通す。

```python
with SessionLocal() as session:      # 窓口を開く
    session.add(Book(title="..."))    # 「この本を登録したい」と伝える
    session.commit()                  # 確定する。ここで初めて DB に書かれる
                                      # with を抜けると、窓口が閉じる
```

- `SessionLocal` は窓口を作る機械で、`SessionLocal()` と呼ぶたびに新しい窓口が 1 つできる
- ツールでは、`with SessionLocal() as session:` を**関数の中**に書く。ツールが呼ばれるたびに窓口を開き、終わったら閉じる
- `with` を関数の外（モジュールの最上位）に書くと、`mcp_server.py` を読み込んだときに 1 回だけ実行され、すぐ閉じてしまう。関数の引数に `session` を書くと、AI から「`session` という文字列を渡す必要があるツール」に見えてしまう。実際に `inputSchema` に `{"session": {"type": "string"}}` が現れ、引数なしで呼ぶとエラーになった

### docstring の位置

docstring になるのは、関数の本体の**最初に書いた文字列**だけ。

```python
@server.tool()
def list_tsundoku() -> list[TsundokuResponse]:
    with SessionLocal() as session:
        """積読の本を…"""   # ← with の中に入ると、ただの「何もしない文字列」になる
        return ...
```

この書き方では、AI に見える説明文が空になった。結果を確かめるテストは通ってしまうので、全部のツールに説明文があることを確かめるテストを足した。

### 説明文の書き方

説明文は、自然な日本語で、**定義をはっきり**書く。AI は、このアプリでの言葉の意味（たとえば「積読」）を知らない。

- 何が入り、何が入らないか（読書中の本は？ 手放した本は？）
- 並び順
- 結果の項目の意味。項目に触れるときは、結果に出てくる名前（`first_purchased_on` など）を使う。DB の列名は AI に見えないので使わない

説明文の誤りは、そのまま AI の誤った答えになる。最初の版では `first_purchase_amount` を「最初に購入した冊数」と書いていた。このままだと、AI が「1980 冊買った」と答えかねなかった。

### 戻り値の形（outputSchema）

`list[TsundokuResponse]` を返すツールの `outputSchema` は、次の形になった。

```json
{
  "$defs": {
    "BookSummaryResponse": { "description": "一覧や明細に添える本の情報。…", ... },
    "TsundokuResponse": {
      "properties": { "book": { "$ref": "#/$defs/BookSummaryResponse" }, ... }
    }
  },
  "properties": {
    "result": { "type": "array", "items": { "$ref": "#/$defs/TsundokuResponse" } }
  }
}
```

- `$defs` に Pydantic のモデルごとの形をまとめ、`$ref` で参照する。同じ形を何度も書かないための JSON Schema のしくみ
- リストを返すツールでも、`{"result": ...}` に包まれ、その中が配列になる
- **Pydantic のモデルの docstring も、AI に届く。** `BookSummaryResponse` の「本の詳細画面へのリンクと表示に使う」は、画面を作る開発者向けの説明で、AI には関係がない。一方、項目に付けた `#` のコメントは届かない
  - ステップ 4-3 で、API にも AI にも通じる「詳しい情報は id で本の詳細を取る」に直した
- `content` には、同じ結果が JSON の文字列として入る。API の応答と同じ形になるのは、同じサービスの関数と同じモデルを使っているため
- MCP Inspector の一覧では、説明文の 1 行目しか見えなかった。SDK のクライアントで確かめると、全文が `description` に入っていた（改行は `\n`）

ツールの結果は、同じ中身を 2 つの形で返す。

| 欄 | 形 | 誰のためか |
|---|---|---|
| `content` | 文字列（テキスト） | AI が読む |
| `structuredContent` | JSON のオブジェクト | プログラムが使う。形は `outputSchema` で約束されている |

- `structuredContent` は、必ず JSON のオブジェクト（`{...}`）でなければならない。そのため、文字列やリストを返すツールは、SDK が `{"result": ...}` に包む
- Pydantic のモデルを返すツールは、JSON にした時点でオブジェクトなので包まれない。`search_books` の `BookSearchResult` は `{"total": ..., "books": [...]}` のまま返り、`outputSchema` でも `properties` のすぐ下に `total` と `books` が並んだ。最初は `{"result": {...}}` になると予想していたが、包むのは決まりを満たさない値をオブジェクトに変えるためだけだった
- テストは `structured_content` を辞書どうしで比べる。`content` の文字列で比べると、空白や項目の順番の違いで不一致になる
- モデルの中にモデルがあると（`BookDetail` の `reading` と `purchases`）、項目そのものは `properties` に並ぶが、中のモデルの形は `$defs` に分けて書かれ、`$ref` で参照される。`null` もありうる `reading` は `"anyOf": [{"$ref": "#/$defs/ReadingDetail"}, {"type": "null"}]`、リストの `purchases` は `"items": {"$ref": "#/$defs/PurchaseDetail"}` になった
- 戻り値の型ヒントには、外側のモデル（`BookDetail`）だけを書けばよい。SDK が中のモデルまでたどるので、`ReadingDetail` などを import する必要はない。逆に、戻り値を `-> None` と書くと、`outputSchema` に結果の形が載らず、AI は項目もその説明も知ることができない
- AI は数字の計算を間違えることがあるので、合計などはサーバーで計算して渡す。本の詳細には、購入金額の合計 `purchase_total` を入れた

### 引数の説明と制約

引数ごとの説明と制約は、型ヒントに `Annotated` と `Field` で付ける。ツール全体の説明は docstring に書く。

```python
limit: Annotated[int, Field(ge=1, le=100, description="返す本の最大件数")] = 20
```

`inputSchema` は JSON Schema という共通の書き方なので、Pydantic の名前が置き換わる。

| Python（Pydantic） | `inputSchema`（JSON Schema） |
|---|---|
| `ge=1`・`le=100` | `"minimum": 1`・`"maximum": 100` |
| 既定値 `= 20` | `"default": 20` |
| `description="..."` | `"description": "..."` |
| `str \| None` | `"anyOf": [{"type": "string"}, {"type": "null"}]` |
| `Literal["unread", "reading", "finished"]` | `"enum": [...]` |

- Python には `str?` という書き方はない。`None` もありうることは `str | None` で書く。`str?` と書くと、`?` の所で読み取りが止まり、エディタには「かっこが閉じていない」と表示された
- 制約は 3 か所で効く。AI は `inputSchema` を読んで範囲内の値を選ぶ。Inspector も `maximum` を読んで、101 を入力させなかった。それでも範囲外の値が届いたら、SDK が関数を実行する前にエラーを返す。クライアントが制約を守るとは限らないので、サーバーの確認は省けない
- `Annotated` には、型と、付け足す情報（`Field(...)`）の 2 つ以上が要る。`Annotated[int]` だけだと `TypeError` になる
- 制約に引っかかったときのエラーの文は、`Error executing tool get_book_detail: 1 validation error for get_book_detailArguments` の前置きのあとに、引数の名前と `Input should be greater than or equal to 1` が続き、最後に pydantic の版を含む URL が付く。テストでは理由を表す `greater than or equal to 1` だけを確かめる。前置きは、どんな理由で引っかかっても同じ文になるので、制約が効いたかどうかを確かめられない。URL の版は、pydantic を更新すると変わる
- Inspector は `minimum` を読んで範囲外の値を入力させないので、範囲外の値でのエラーの文は、制約を見ずにそのまま送る SDK のクライアント（テスト）で確かめた。`pytest -s` を付けると、テストの中の `print` が表示される
- `enum` で選べる値は伝わるが、どれが何を意味するかは伝わらない。`statuses` に「finished=読了」と説明を付けたので、「読了した本を探して」と頼むと、Claude は `statuses: ["finished"]` で呼んだ

### AI に見えるもの

AI が知ることができるのは、サーバーが送ったメッセージの中身と、自分が渡した引数だけ。

| 時点 | メッセージ | 中身 |
|---|---|---|
| 呼ぶ前 | `tools/list` の応答 | ツールの名前、説明文、`inputSchema`、`outputSchema`（モデルの docstring と `Field` の説明を含む） |
| 呼んだあと | `tools/call` の応答 | `content`（ホストによっては `structuredContent` も） |

- Python のコード、`#` のコメント、サービスの関数の docstring、結果に入れなかった DB の中身は届かない
- 説明文には、AI が見える値で条件を書く。`limit` で切ったあとの結果しか届かないので、「結果が limit より多い場合」は AI には判断できない。「`total` が `books` の件数より多い場合」と書いた。`limit` と件数が同じでも、ちょうどその数だけ当てはまったのかもしれないので、残りがあるかは `total` でしかわからない
- 確かめ方は 2 つ。Inspector で、サーバーが何を送ったかを見る。Claude Code で実際に頼んで、AI がどう受け取り、どう使ったかを見る
- `inputSchema` はファイルには書かれていない。サーバーが動いている間に SDK が型ヒントから作り、`tools/list` の応答に載せる

### テストの書き方

- SDK のクライアントは非同期で動くので、テストも `async def` で書き、`@pytest.mark.anyio` を付ける。anyio は SDK と一緒に入る
- `Client(mcp_server.server)` で、サーバーを子プロセスで起動せずに、同じプロセスの中でつなぐ。`initialize` → `tools/list` → `tools/call` のやりとりは本物と同じ
- フィクスチャは、テスト関数の引数に名前を書くだけで、pytest が準備して渡す
- `client.call_tool(名前, 引数)`・`result.structured_content`・`result.is_error` などの名前は、MCP の通信の項目（`tools/call`・`structuredContent`・`isError`）をスネークケースにしたもの
- `call_tool` の 2 つめは、ツールに渡す引数（辞書）。引数のないツールには `{}` を渡す
- テストでは、`mcp_server.SessionLocal` を一時 DB 向けのものに差し替える。`from app.database import SessionLocal` は、`SessionLocal` という名前を `mcp_server` のモジュールにコピーするので、`mcp_server` の中の名前だけを付け替えればよい。`monkeypatch.setattr` は、差し替える名前が見つからないとエラーにするので、書き方を間違えても黙って本物の DB を使うことはない
- ひな形の `...` は、書きかけの印ではなく `Ellipsis` という本物の値。埋め忘れると、DB に書き込む時点で `type 'ellipsis' is not supported` になる
- ループの中の `assert` は、ループが 0 回だと何も確かめずに通る。`if` で対象を探す書き方も同じ。ループの前に、対象があることを `assert` で確かめる
- MCP のテストで確かめるのは、ツールがサービスに正しくつながり、結果が正しい形で届くか。積読の決まり（どの本が入るか、並び順）は API のテストが同じサービスを通して確かめているので、MCP のテストでは繰り返さない
- `call_tool` は `call_tool(ツールの名前, 引数の辞書)` の形で呼ぶ。`call_tool("limit", 101)` と書くと、「`limit` というツールを引数 `101` で呼ぶ」意味になる
- エラーのテストは、`is_error` だけでなく、エラーの理由まで確かめる。`is_error` だけだと、ツールの名前を間違えたときの「そんなツールはない」というエラーでも通ってしまう。`limit` に 101 を渡すテストでは、`result.content[0].text` に `less than or equal to 100` が含まれることも確かめた
- テストのデータは、確かめることに関係するものだけ入れる。検索は購入記録を見ないので、検索のテストに `Purchase` は入れない。入れると、読む人が「購入記録が検索に関係するのか」と迷う
- `call_tool` の引数は、名前と値の組の辞書（`{"book_id": 1}`）で書く。`{ }` に値だけを並べると集合（set）になり、どの値がどの引数かわからない。省きたい引数は、辞書に書かない
- 日付は、使う場所で書き方が違う。Python の中では `date` の値、MCP の通信（JSON）の中では文字列。その間の変換は SDK がする

| 場所 | 書き方 |
|---|---|
| DB に入れる値（`ReadingRecord(...)`） | `date(2026, 11, 1)` |
| ツールに渡す引数 | `"2026-11-01"`（文字列） |
| 結果（`structured_content`）と比べる値 | `"2026-11-01"`（文字列） |
| エラーの文の中 | `2026-11-01`（`str(date)` の形。月と日は 2 桁） |

- `2026-11-1` と書くと、Python では引き算（2014）になる。`date("2026-11-01")` は書けない（`date()` は数字を 3 つ受け取る）
- 例外の種類で処理を分けるときは、`except` を種類ごとに並べる。`if e == BookNotFoundError:` は、例外の実物（インスタンス）と種類（クラス）を比べるので、いつも偽になる

### ホストの許可

Claude Code では、許可が 2 段階ある。

| 段階 | 何を許可するか | 記録される場所 |
|---|---|---|
| サーバーの許可 | `.mcp.json` のサーバーを起動してよいか。clone したリポジトリの `.mcp.json` で、勝手にコマンドが実行されないようにするため | `.claude/settings.local.json` の `enabledMcpjsonServers`（個人の設定なので git に入れない） |
| ツールの許可 | このツールを、この引数で呼んでよいか | 権限のモードと、許可のルールで決まる |

- Claude Code は、ツールを `mcp__<設定の名前>__<ツールの名前>` という名前で扱う（例：`mcp__bookkeeper__ping`）。この名前は、許可のルールにも使う
- 「つながっているか確かめて」と頼むと、`ping` という名前を出さなくても、Claude は `ping` を選んだ。説明文を読んで判断している

#### 権限のモード

| デスクトップアプリの表示 | モード | 許可の聞き方 |
|---|---|---|
| 自動 | auto | Claude Code が操作ごとに安全かどうかを判断し、問題ないと見たものは、ルールになくても聞かずに実行する |
| 手動 | default | 許可のルールに従う。`allow` にあるものは聞かず、それ以外はその都度聞く |
| 編集を受け入れる | acceptEdits | ファイルの編集は聞かずに実行する。それ以外は手動と同じ |
| プラン | plan | 変更を加えず、計画を立てるだけ |
| 権限をバイパス | bypassPermissions | 何も聞かずに実行する |

- ステップ 2 で `ping` を呼んだとき、許可を聞かれなかったのは、自動モードだったため。ステップ 7 で、許可のルールがないまま自動モードで試すと、読み取りのツールも書き込みのツールも聞かれなかった
- 許可のルールを確かめるときは、手動モードで試す

#### 許可のルール

[.claude/settings.json](../.claude/settings.json) に、ツールごとの許可を書いた。

```json
{
  "permissions": {
    "allow": ["mcp__bookkeeper__ping", "mcp__bookkeeper__list_tsundoku", "…読み取りのツール 7 つ"],
    "ask": ["mcp__bookkeeper__update_reading_status"]
  }
}
```

- 方針：DB を変えるツール（読書状態の更新）だけ、毎回許可を取る。読み取りのツールは聞かずに使う
- `allow` に `"mcp__bookkeeper"` と書くと、サーバーの全部のツールをまとめて許可できるが、書き込みのツールも聞かれなくなる。読み取りのツールを 1 つずつ並べた。ツールを足したら、ここも見直す
- 書き込みのツールは、`allow` に入れないだけでも手動モードでは聞かれる。それでも `ask` に書いたのは、「入れ忘れ」ではなく「わざと聞く」という意図をファイルに残すため
- `settings.json`（git に入れる、全員に効く）に置いた。ルールがなくても手動モードでは全部聞かれるので、危ない側に倒れるわけではない。置く理由は、clone した人も同じ使い心地になることと、どのツールを安全と考えたかが記録に残ること。個人の設定は `settings.local.json`（git に入れない）に置く
- 許可を決めるのはホスト。サーバーは許可のルールを知らず、許可が済んだ呼び出しだけが届く。なので、ルールを変えてもコンテナの再起動は要らない。Claude Code の新しいセッションで読み直される
- 手動モードで試すと、読み取りのツールは聞かれず、`update_reading_status` だけ聞かれた
- 最初に試したセッションでは、全部聞かれた。ルールを保存する前に始めたか、デスクトップアプリが作った worktree で動いていたためと考えられる。worktree には、コミット済みのファイルしか入らないので、コミットしていない `settings.json` は読まれない
- 自動モードで `ask` のルールが効くかどうかは、確かめていない

#### MCP の許可は扉の鍵で、壁ではない

フォルダを指定しないセッション（自動モード）で、積読の一覧と読書状態の更新を頼むと、どちらも許可を聞かれずに実行され、DB の中身が実際に変わった。Claude は次のように伝えてきた。

> このセッションには bookkeeper の MCP がつながっていないので、起動中の backend コンテナの中で list_tsundoku ツールの関数を直接呼んで取得しました。

```
ふつうの流れ：  Claude → MCP（mcp__bookkeeper__…）→ サーバー → DB
このときの流れ：Claude → シェル（docker compose exec … python）→ 関数 → DB
```

- フォルダを指定しないので、`.mcp.json` も `.claude/settings.json` も読まれず、MCP のツールは使えなかった
- それでも Claude はシェルを使えた。Docker は PC 全体で動いているので、どのフォルダからでも、起動中のコンテナに入れる
- 許可のルールは MCP のツールの名前に対するもので、シェルは別の道具。自動モードでは、シェルのコマンドも Claude Code が安全と判断すれば聞かずに実行される
- MCP のツールと許可のルールは、AI が DB に触れるための決められた入り口を作る。でも、AI がシェルのような強い道具を持っていると、入り口を通らずにデータへ直接たどり着ける。書き込みを本当に止めたいなら、AI に渡す道具そのものを絞る（シェルのないホストで使う、手動モードで使う）必要がある

| ホスト | AI が使える道具 | MCP の許可で守れるか |
|---|---|---|
| Claude Desktop の Chat | MCP のツールだけ | 守れる。ほかに道がない |
| Claude Code（手動モード） | MCP のツール＋シェルなど | シェルのコマンドも毎回聞かれるので、確認すれば気づける |
| Claude Code（自動モード） | MCP のツール＋シェルなど | 守れない。シェルで回り道ができ、それも聞かずに実行されうる |

DB にたどり着く道は、コンテナの中で関数を呼ぶほかにもある。DB はホストのファイル（`backend/bookkeeper.db`）で、コンテナとはフォルダを共有しているだけなので、`sqlite3` でファイルを直接開くこともできる。API（`127.0.0.1:8000`）には認証がないので、`curl` で呼ぶこともできる。この PC で利用者の権限で動くプログラムなら、何でも DB を変えられる。シェルを持つ AI もその 1 つなので、どこか 1 つの道を塞いでも（`deny` のルールで `docker compose exec` を禁止するなど）、ほかの道が残る。

#### どこまでが bookkeeper の問題か

| 問い | 答え |
|---|---|
| bookkeeper が新しい穴を作ったか | 作っていない。MCP のツールに、ファイルの場所やコマンドを受け取る引数はなく、SQL は ORM で組み立てる。stdio なのでネットワークで待ち受けない。`.claude/settings.json` が許すのは読み取りの MCP ツールだけで、シェルは許していない |
| 自動モードの AI は何ができるか | もともと利用者と同じことができる。特に Docker を使えると、コンテナに PC のフォルダをつないで読み書きすることもできる。対象が bookkeeper だったのは、たまたま頼んだから。これは bookkeeper ではなく、Claude Code の自動モードと PC の環境の性質 |
| bookkeeper が関わる危険はあるか | ある。MCP のツールは、書名・著者・メモなどの文字を AI に渡す。書誌情報の一部は外部の openBD から取り込んでいるので、自分で書いていない文字が AI に届く。その中に指示のような文が紛れていると、AI が従ってしまうおそれがある（プロンプトインジェクション）。シェルを持つ AI が従えば、bookkeeper の外にも影響しうる。openBD は出版業界の公開データベースなので現実の危険は小さいが、外から来た文字が強い道具を持つ AI に届く道であることは確か |

#### 運用の決まり

- AI に bookkeeper のデータを変えてもらうときは、手動モードで頼む。変更の前に必ず確認が入る
- 自動モードでも使えるが、MCP のツールを通らずに（シェルから直接）データが変わることがある。また、本のデータに紛れた指示に AI が従うおそれもある。手動モードなら、AI が何かを実行する前に確かめられる
- ほかの作業や、データを読むだけの使い方は、自動モードのままで構わない。自動モードをこのリポジトリ以外で使わない、といった制限まではしない
- 万一、意図しない変更があったときは、起動のたびに取るバックアップから戻す（別のブランチ `feature/db-backup` で作る）
- 守りの中心はバックアップにする。止める仕組みは道が多くて塞ぎきれないが、戻せる仕組みは、どの道で変わっても、AI 以外の操作ミスでも効く
- Claude Code のサンドボックス（シェルのコマンドの書き込み先や接続先を狭める機能）も検討した。別のフォルダのセッションから DB のファイルを書き換える道には効くが、bookkeeper のフォルダのセッションでは DB が作業フォルダの中にあるので守れない。Docker の道も、Docker のサービスがサンドボックスの外で動くので、設定次第で開いたままになる。Windows で使えるかもはっきりしない。サンドボックスは bookkeeper ではなく Claude Code の使い方の設定なので、bookkeeper では扱わず、利用者の設定に任せた

### ツールの注釈

ツールの性質を、ホストに伝えるためのヒント。`@server.tool(annotations=ToolAnnotations(...))` で付ける（`from mcp.types import ToolAnnotations`）。Python ではスネークケース（`read_only_hint`）で書き、通信ではキャメルケース（`readOnlyHint`）になる。

| 注釈 | 意味 | 既定値 |
|---|---|---|
| `read_only_hint` | 何も変えない | `false` |
| `destructive_hint` | 元に戻せない変更をしうる。`false` なら、足すだけの変更 | `true` |
| `idempotent_hint` | 同じ引数で何度呼んでも、2 回目以降は何も変わらない | `false` |
| `open_world_hint` | 外の世界（インターネットなど）に触れる | `true` |

- 省いた注釈は既定値として扱われる。`open_world_hint` を省くと「外の世界に触れる」と見なされるので、手元の DB しか触らないツールでは `False` を明示した
- 読み取りの 7 つのツールは `read_only_hint=True, open_world_hint=False`。`read_only_hint=True` のとき、`destructive_hint` と `idempotent_hint` は意味を持たない
- `update_reading_status` は `destructive_hint=True, idempotent_hint=True, open_world_hint=False`。`destructive_hint` を `True` にしたのは、読み始めた日などを上書きすると、前の値がどこにも残らないため。DB には変更の履歴がないので、「もう一度呼べば戻せる」のは、呼ぶ側が前の値を覚えているときだけ
- 注釈は自己申告のヒントで、守られる保証はない。`read_only_hint=True` と書いても、ツールが書き込めなくなるわけではない。SDK の説明にも、信頼できないサーバーの注釈でツールの使い方を決めてはいけない、とある
- `server.tool()` の引数は `annotations=` 1 つで、その中に `ToolAnnotations(...)` を渡す。`server.tool(read_only_hint=True)` と直接書くと `TypeError` になる

### エラーの扱い

ツールが失敗したときに AI へ届く文は、例外の種類で決まる（SDK のコードを読んで確かめた）。

| 種類 | 例 | AI に届く文 | サーバーのログ |
|---|---|---|---|
| 引数の誤り | `book_id=0`、`month=13` | `Error executing tool <名前>: ` の後に理由 | 引数の名前だけ（INFO） |
| 予想していた失敗（`ToolError`） | ツールが `ToolError("…")` を投げる | `Error executing tool <名前>: ` の後にその文 | 文だけ（INFO） |
| 予想していない失敗（ほかの例外） | `BookNotFoundError`、DB の故障、バグ | `Error executing tool <名前>` だけ | 例外の全文（ERROR） |
| 存在しないツール | `call_tool("nope", {})` | `Unknown tool: nope` | |

- SDK が予想していない例外の文を隠すのは、SQL やファイルの場所など、外に見せたくない情報が入りうるため。中身はサーバーのログ（標準エラー出力）にだけ残る
- そのため、AI に理由を伝えたい失敗は、`from mcp.server.mcpserver.exceptions import ToolError` の `ToolError` に変えて投げる。`raise ToolError("…") from e` の `from e` は、元の例外をログに残すためのもの。AI に届くのは、かっこの中の文だけ
- 変換するのは、ツールの関数（`mcp_server.py`）の中。サービスは API からも使うので、MCP のことを知らないほうがよい。API でも、ルーターが「本がない」を 404 に変えている（`get_book_or_404`）
- エラーにするか、普通の結果にするかを分ける。検索で 1 冊も当たらない、購入記録のない月は、「ない」という正しい答えなので普通の結果にする。指定した ID の本がないのは、頼まれたものを返せていないのでエラーにする
- エラーの文には、何が起きたかと、次にどうすればよいかを書く。理由がわからないと、AI は同じ呼び出しを繰り返すか、「エラーが起きました」とだけ答えることになる
- 存在しない ID で呼ばれるのは、AI が ID を取り違えたり推測したりしたとき（本の ID と購入記録の ID など）、会話の途中で本が削除されたとき、ユーザーが ID を直接言ったときなど。どれも AI の手元の ID が信用できないので、案内は「ID を調べ直す」にした
- 失敗したときの案内は、説明文（docstring）ではなくエラーの文に書く。説明文は、つなぐたびにどの会話でも読まれる。エラーの文は、失敗したときにその場で読まれる。まれにしか起きないことの対処は、エラーの文のほうが、必要なときに確実に読まれる
- 三重引用符（`"""`）の文字列には、改行も行の頭の空白も入る。エラーの文に使うと、AI に大量の空白が届き、言葉も途中で切れた。複数の行に分けて書くときは、かっこの中に文字列を並べる（Python がつなげる）
- テストでは、エラーの文のうち理由の部分（`id が 999 の本はありません`）を確かめる。`BookNotFoundError` を受け止めたことと、渡した ID が届いたことの両方がわかる。案内の部分は、AI の動きを見て言い回しを直すことが多いので、テストには使わない

### ホストごとの登録

同じサーバーでも、ホストごとに設定の書き方と置き場所が違う。サーバーのコードは変えなくてよく、書く中身は「起動するコマンドと引数」で同じ。動作を確かめたのは Claude Code だけ。

| ホスト | 確認 | 設定 | 注意 |
|---|---|---|---|
| Claude Code（ターミナル、デスクトップアプリの Code タブ） | 確認済み | リポジトリの [.mcp.json](../.mcp.json)（`--scope project`） | セッションのフォルダがリポジトリのときだけ読まれる |
| Claude Desktop（デスクトップアプリの Chat） | 未確認 | `claude_desktop_config.json`。設定 → 開発者 → 設定を編集で開く | `.mcp.json` は読まない。どのフォルダから起動されるか決まっていないので、`docker compose -f <リポジトリの場所>/docker-compose.yml exec ...` とファイルの場所を指定する。設定を変えたら、タスクトレイから終了して起動し直す |
| Gemini CLI・Codex CLI・VS Code など | 未確認 | それぞれの設定ファイル | 手元の PC で動くので stdio のサーバーを登録できる |
| ChatGPT・Gemini（ブラウザ・アプリ） | 対象外 | | AI が提供元のサーバーで動くので、手元の PC のコマンドは起動できない。つなぐには、サーバーを HTTP で動かし、インターネットから届く場所に置く必要がある |

- デスクトップアプリの Chat で「ID が 999 の本の詳細を見せて」と頼むと、「作業ディレクトリに bookkeeper のコードやデータベースがない」と言われた。Chat は `bookkeeper` を登録していなかったので、AI はツールを使えず、手元のファイルを探した
- 同じアプリの Code タブで、リポジトリのフォルダのセッションから呼ぶと、ツールが使えた

## 実装の記録

### ステップ 1：最小の MCP サーバー

- [backend/app/mcp_server.py](../backend/app/mcp_server.py) に、`"pong"` を返すだけの `ping` ツールを持つサーバーを作った
- MCP Inspector で動きを確かめた。Inspector も、ホストと同じようにサーバーを子プロセスとして起動する

```sh
npx @modelcontextprotocol/inspector@2.11.0 uv --directory backend run python -m app.mcp_server
```

- Inspector は、つないだときに起動したサーバーのプロセスを使い続ける。コードを変えたら、つなぎ直す（Disconnect → Connect）と反映される

### ステップ 2：Claude Code につなぐ

- stdio のサーバーを、backend のコンテナの中で起動する。Claude Code は `docker compose exec` を起動し、docker が標準入出力をコンテナの中のプロセスに中継する

```
Claude Code（ホスト）
   │ 起動：docker compose exec -T backend uv run python -m app.mcp_server
   ↓
docker（ホストの PC で動く）── 標準入出力を、そのまま中継する ──┐
                                                                  ↓
                                    backend のコンテナ：python -m app.mcp_server
```

- コマンドの `backend` は、`docker-compose.yml` のサービスの名前（フォルダの `backend/` ではない）。`exec` は動いているコンテナを使うので、先に BookKeeper を起動しておく必要がある
- `-T` は、疑似端末（TTY）を割り当てない指定。端末を割り当てると、改行の変換などが JSON のやりとりを乱すおそれがある。今回は `-T` がなくても動いたが、確実にするために付ける
- 次のコマンドで登録した。`--scope project` を付けると、設定がリポジトリの [.mcp.json](../.mcp.json) に保存され、clone した人も同じ設定を使える

```sh
claude mcp add --scope project bookkeeper -- docker compose exec -T backend uv run python -m app.mcp_server
```

- Windows の PowerShell では、`--` を `'--'` と引用符で囲む。`claude` は `claude.ps1`（PowerShell のスクリプト）として起動し、PowerShell はスクリプトに `--` を渡さずに取り除く。`--` が消えると、`claude` が `-T` を自分のオプションと取り違えて `error: unknown option '-T'` になる
- 設定の名前（`bookkeeper`）と、サーバーが名乗る名前（`MCPServer("BookKeeper")`）は別のもの。設定の名前はツールの名前（`mcp__bookkeeper__ping`）に使われるので、ほかのサーバーにならって小文字にした
- Python の SDK のクライアントから同じコマンドで起動すると、docker が compose のプラグインを見つけられずに失敗した。SDK は安全のために、子プロセスに渡す環境変数を最小限に絞るため。Claude Code では起きなかったので、Claude Code は環境変数をそのまま渡していると考えられる

### ステップ 3：積読の一覧のツール

- 積読を取り出す処理は、API のルーターに直接書かれていた。これを [backend/app/services/tsundoku.py](../backend/app/services/tsundoku.py) の `list_tsundoku(session)` に切り出し、API のルーターと MCP のツールの両方から呼ぶようにした
  - ルーターの関数に `@server.tool()` を付けない理由：引数の `session`（FastAPI が渡す DB のセッション）が AI に見えてしまう。ルーターの docstring は開発者向けで、AI 向けの説明文とは書く内容が違う。Web API と MCP が互いに縛り合う
  - 切り出したあとも、積読の API のテストはそのまま通った。API の動きは変わっていない
- `list_tsundoku` のツールを作った。引数はなく、戻り値は API と同じ `list[TsundokuResponse]`
- [backend/tests/test_mcp_server.py](../backend/tests/test_mcp_server.py) にテストを書いた。本がないときの空のリスト、積読の本が 1 冊あるときの結果、全部のツールに説明文があること

### ステップ 4-1：本の検索のツール

- 画面の検索は、ブラウザの中で全件から絞り込んでいる。MCP では AI が全件を受け取らずに済むよう、サーバーで絞り込む処理を [backend/app/services/books.py](../backend/app/services/books.py) の `search_books` に新しく作った。一致のルール（全角と半角・大文字と小文字を区別しない、空白で区切った語をすべて含む）は画面と同じにした
- 結果は軽い形（id・書名・著者・読書状態・手放した日）にした。詳しい情報は、id を使って本の詳細のツール（4-2）で取る
- 件数に上限（`limit`、既定値 20、1〜100）を設け、当てはまった本の数 `total` を一緒に返す。AI は `total` と `books` の件数を比べて、残りがあることに気づける
- `search_books` のツールを作った。引数は `keyword`・`statuses`・`limit`。説明文には、`total` が `books` の件数より多いときは、残りがあることを伝え、キーワードで絞るか尋ねるように書いた
- テストは、キーワードがサービスまで届くことと、`limit` に 101 を渡すとエラーになることを確かめた。検索のルールそのものは [backend/tests/test_search_books.py](../backend/tests/test_search_books.py) で確かめている
- Claude Code で「本を 2 冊だけ見せて」と頼むと、`limit: 2` で呼び、残りがあることと、キーワードで絞るかを伝えてきた。説明文のとおりに動いた

### ステップ 4-2：本の詳細のツール

- [backend/app/services/books.py](../backend/app/services/books.py) に、本 1 冊の書誌情報・読書記録・購入記録をまとめて返す `get_book_detail` を作った。本がなければ `BookNotFoundError` を投げる
- 結果のモデル（`BookDetail`・`ReadingDetail`・`PurchaseDetail`）は、API のモデルとは別に AI 向けに作った。API のモデルの説明は開発者向けなので、AI に余計な説明が届くため。表紙の URL、登録日時、各記録の id は、AI が答えに使うことがほとんどないので入れなかった
- `list_price` の説明に「実際に支払った金額ではないので、書籍費には purchases の amount を使う」と書いた。定価と支払額を AI が取り違えないようにするため
- `get_book_detail` のツールを作った。引数は `book_id`（1 以上）。`id` という名前は Python の `id()` を隠すうえ、AI から見て何の id かわかりにくい
- 本の id は、検索・積読の一覧・書籍費の明細など、いくつものツールの結果に入っている。説明文では「id はほかのツールの結果に含まれる」とまとめて書き、id がわからないとき（書名で頼まれたとき）の手段として `search_books` の名前だけを出した。ツールの名前を全部並べると、ツールを足すたびに説明文を直す必要が出る。検索の結果の説明（`BookSearchItem`）にも「詳しい情報は本の詳細のツールで取る」と書いてあり、検索 → 詳細の道筋を両方から示している
- テストでは、本の詳細が返ることと、`book_id` に 0 を渡すとエラーになることを確かめた。詳細のテストでは、`title` のほかに `reading` の `status` と `purchase_total` を確かめ、3 つの記録がまとめて届くことを確かめた
- 存在しない id（999）で呼ぶと、`is_error` が真で、`content` には `Error executing tool get_book_detail` だけが返った。サービスの例外の文（「id が 999 の本はありません」）は AI に届かない。SDK は、予期しない例外の中身を隠し、前置きだけを返す。これはステップ 5 で扱う

### ステップ 4-3：書籍費のツール

- 書籍費の 3 つの処理（年ごとの一覧、1 年の内訳、1 か月の明細）を、API のルーターから [backend/app/services/expenses.py](../backend/app/services/expenses.py) に切り出した。切り出したあとも、書籍費の API のテスト 39 件はそのまま通った
- 書籍費のモデルは、項目の意味を `#` のコメントで書いていたため、AI には届かなかった。どうするかを 3 つの案で比べた

| 案 | 内容 | 判断 |
|---|---|---|
| A | API のモデル（`schemas.py`）のコメントを `Field(description=...)` に書き換える | **採用** |
| B | AI 向けのモデルを別に作り、API には変換して返す（4-2 と同じ） | 同じ形のモデルが 2 組できる |
| C | API のモデルをそのまま使い、意味はツールの docstring に書く（ステップ 3 と同じ） | 項目の説明が `outputSchema` に載らない |

- A にしたのは、書籍費は API と MCP で結果の形が同じで、項目の意味（「購入記録の金額の合計（円）」など）も開発者と AI で変わらないため。4-2 で別のモデルを作ったのは、3 つの記録をまとめた、API にはない形だったから。説明は API のドキュメント（`/docs` の OpenAPI）にも載る。応答の中身は変わらない
- AI が取り違えそうな所に説明を足した。`total` は「本の定価ではない」、`count` は「冊数ではない」（購入記録の件数）、明細の `id` は「本の ID ではない」（購入記録の ID）
- `BookSummaryResponse` は積読の一覧でも使っているので、docstring を直すと `list_tsundoku` の `outputSchema` も一緒に良くなった。モデルを共有すると、説明の改善も共有される
- ツールを 3 つ作った。`list_yearly_expenses`（引数なし。リストなので `{"result": [...]}` に包まれる）、`get_year_expenses`（`year`）、`get_month_expenses`（`year`・`month`）
- サービスは、`year` が 1〜9999、`month` が 1〜12 であることを前提にしている。範囲外の値が届くと日付を作るところで例外が起き、AI には `Error executing tool ...` しか返らない。そこで、引数の制約で関数を実行する前に止めた。2 つのツールで同じ制約を使うので、`Year`・`Month` という型の別名（`Annotated[int, Field(...)]`）にまとめた。API の `YearPath`・`MonthPath` と同じ考え方
- 説明文には、3 つに共通して「書籍費は実際に支払った金額で、定価ではない」と書いた。そのうえで、どんな質問のときに使うか（年をまたいだ比較／1 年の中の月の比較／ある月に何を買ったか）と、ほかのツールのどれに進めばよいかを書いた。AI はツールごとに説明を読むので、同じことを何度書いても構わない
- 購入記録がない年や月でもエラーにならず 0 が返ることを、説明文に書いた。AI が「0 円」を失敗と取り違えないようにするため
- 4-3 は時間の都合で、ツールとテストも Claude が書いた

### ステップ 5：エラーの扱い

- 4-2 で、存在しない本の ID で呼ぶと、AI には `Error executing tool get_book_detail` しか届かなかった。サービスの `BookNotFoundError` が、SDK から見ると予想していない例外だったため
- `get_book_detail` のツールで `BookNotFoundError` を受け止め、`ToolError` に変えて投げるようにした。文は「id が 999 の本はありません。」の後に、渡した ID を調べ直すこと、本の ID と購入記録の ID の取り違えや推測した ID の可能性、書名や著者がわかれば `search_books` で探せることを続けた
- AI に届く文は、`ToolError` に書いた文の前に `Error executing tool get_book_detail: ` が付いた。引数の誤りのときと同じ前置き
- 当初の計画では「正しくない年」も扱う予定だったが、4-3 の引数の制約（`Year`・`Month`）で解決済みだった
- ターミナルの Claude Code の新しいセッションで「ID が 999 の本の詳細を見せて」と頼むと、期待どおり、ID を推測して呼び直さずに、本がないことを伝えて書名などを尋ねた。別のセッションでも同じだった
- 途中で Claude が確認用のスクリプトで 999 の応答を確かめたとき、メモリ上の SQLite の作り方を誤り、「テーブルがない」という別の例外で失敗していた。結論（予想していない例外の文は届かない）は正しかったが、`ToolError()` に文を渡さなかったときの応答は確かめられていなかった。確認は、テストと同じしくみ（`StaticPool` などで同じ DB を共有する）で行う

### ステップ 7：書き込みのツール

- 録画をステップ 7 のあとに撮ることにしたので、ステップ 6（仕上げ）と順番を入れ替えた
- [backend/app/services/books.py](../backend/app/services/books.py) に、読書状態と日付を変える `update_reading_status` を作った。API の PUT（丸ごと置き換え）とは違い、MCP では変えてよい範囲を狭くした
  - 読書のメモは変えない。AI がメモを送り忘れて、ユーザーの感想が消えないようにするため
  - 日付は、省くと今の値のまま。そのかわり、MCP からは日付を消せない
  - 日付の自動入力はしない（API と同じ）。「今日読み終わった」と言われたら、AI が今日の日付を渡す
  - 読み終えた日が読み始めた日より前なら、何も変えずにエラーにする。省いた日付は今の値で比べる
  - 結果は更新したあとの本の詳細。AI が書名と一緒に結果を伝えられる
- `update_reading_status` のツールを作った。3 つの例外（本がない、読書記録がない、日付の順番が逆）を、それぞれ次の手を添えた `ToolError` に変えた
- 8 つのツールすべてに注釈を付けた（「ツールの注釈」を参照）
- テストでは、読書状態と日付が更新されること、日付の順番が逆のときに理由が届くこと、書き込みのツールだけが読み取り専用でないことを確かめた
- [.claude/settings.json](../.claude/settings.json) に許可のルールを書いた。手動モードでは、読み取りのツールは聞かれず、更新だけ聞かれた
- フォルダを指定しないセッション（自動モード）では、MCP がつながっていないのに、Claude がシェルからコンテナの中の関数を直接呼び、許可を聞かずに DB を更新した（「MCP の許可は扉の鍵で、壁ではない」を参照）
