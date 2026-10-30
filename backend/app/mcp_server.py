"""AIのアプリ(Claudeなど)からBookKeeperのデータを読むためのMCPサーバー。stdioで起動する"""

from mcp.server.mcpserver import MCPServer

server = MCPServer("BookKeeper")


@server.tool()
def ping() -> str:
    """サーバーにつながっているか確かめる"""
    return "pong"


if __name__ == "__main__":
    server.run()
