from typing import Protocol

import requests

from app.ai.prompts import expense_prompt

CONNECT_TIMEOUT_SECONDS = 10
READ_TIMEOUT_SECONDS = 180


class Provider(Protocol):
    def expense_request(self, model: str, images: list[tuple[str, str]], categories: list[str]) -> dict: ...
    def send(self, payload: dict) -> requests.Response: ...
    def content(self, response: dict) -> str: ...
    def usage(self, response: dict) -> dict: ...


class NvidiaProvider:
    def __init__(self, url: str, api_key: str):
        self.url = url
        self.api_key = api_key

    def expense_request(self, model: str, images: list[tuple[str, str]], categories: list[str]) -> dict:
        return {
            "model": model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": expense_prompt(categories)},
                    *[
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}
                        for mime, data in images
                    ],
                ],
            }],
            "max_tokens": 4096,
            "stream": False,
            "temperature": 0.1,
        }

    def send(self, payload: dict) -> requests.Response:
        return requests.post(
            self.url,
            headers={"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"},
            json=payload,
            timeout=(CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS),
        )

    def content(self, response: dict) -> str:
        content = response["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ValueError("Invalid response content")
        return content

    def usage(self, response: dict) -> dict:
        usage = response.get("usage", {})
        return usage if isinstance(usage, dict) else {}
