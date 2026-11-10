from typing import Protocol

import requests

from app.ai.prompts import expense_prompt

CONNECT_TIMEOUT_SECONDS = 10
READ_TIMEOUT_SECONDS = 3 * 60


class Provider(Protocol):
    name: str

    def expense_request(self, model: str, images: list[tuple[str, str]], categories: list[str]) -> dict: ...
    def send(self, payload: dict) -> requests.Response: ...
    def content(self, response: dict) -> str: ...
    def usage(self, response: dict) -> dict: ...


class NvidiaProvider:
    name = "nvidia"

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


class DeepseekProvider(NvidiaProvider):
    """DeepSeek's chat API is OpenAI-compatible: POST {base_url}/chat/completions."""

    name = "deepseek"

    def __init__(self, base_url: str, api_key: str):
        super().__init__(f"{base_url.rstrip('/')}/chat/completions", api_key)

    def expense_request(self, model: str, images: list[tuple[str, str]], categories: list[str]) -> dict:
        payload = super().expense_request(model, images, categories)
        payload["thinking"] = {"type": "disabled"}
        return payload
