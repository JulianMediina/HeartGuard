from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Paginación `{count, next, previous, results}` con `?page=` y `?page_size=`."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 200
